package opendota;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

final class AnalysisStorage {
    static final String STORAGE_SCHEMA = "analysis-storage/1.0";
    static final String SNAPSHOT_SCHEMA = "snapshot-columns/1.0";

    private static final Gson GSON = new Gson();
    private static final List<String> MODULE_NAMES = List.of(
            "snapshots", "development", "build", "farm", "laning", "vision",
            "combat", "objectives", "map", "timeline", "players", "module_evidence",
            "coordinate_system");
    private static final Set<String> EAGER_MODULES = Set.of(
            "snapshots", "development", "laning", "objectives", "map", "players",
            "module_evidence", "coordinate_system");
    private static final List<String> SNAPSHOT_FIELDS = List.of(
            "second", "gold", "networth", "xp", "lh", "x", "y", "region",
            "life_state", "hp", "max_hp", "mana", "max_mana", "level");

    private AnalysisStorage() {
    }

    static JsonObject write(Path analysisDirectory, Path summaryPart, JsonObject fullAnalysis) throws IOException {
        JsonObject sourceModules = object(fullAnalysis, "modules");
        String generation = Long.toUnsignedString(System.currentTimeMillis(), 36) + "-"
                + UUID.randomUUID().toString().substring(0, 8);
        Path generationDirectory = analysisDirectory.resolve("modules").resolve(generation);
        Files.createDirectories(generationDirectory);

        JsonObject storedValues = new JsonObject();
        JsonObject moduleFiles = new JsonObject();
        List<String> available = new ArrayList<>();
        try {
            for (String name : MODULE_NAMES) {
                JsonElement source = sourceModules.get(name);
                if (source == null || source.isJsonNull()) continue;
                JsonElement stored = name.equals("snapshots") ? packSnapshots(source) : source;
                Path target = generationDirectory.resolve(name + ".json.gz");
                Path part = target.resolveSibling(target.getFileName() + ".part");
                writeGzip(part, stored);
                moveReplacing(part, target);

                JsonObject file = new JsonObject();
                file.addProperty("encoding", "gzip");
                file.addProperty("bytes", Files.size(target));
                moduleFiles.add(name, file);
                available.add(name);
                if (EAGER_MODULES.contains(name)) storedValues.add(name, stored);
            }

            JsonObject compact = copyWithout(fullAnalysis, "modules", "analysis_storage");
            JsonObject compactModules = new JsonObject();
            copyIfPresent(sourceModules, compactModules, "schema");
            copyIfPresent(sourceModules, compactModules, "time_contract");
            for (String name : MODULE_NAMES) {
                if (storedValues.has(name)) compactModules.add(name, storedValues.get(name));
            }
            compact.add("modules", compactModules);

            JsonObject storage = new JsonObject();
            storage.addProperty("schema", STORAGE_SCHEMA);
            storage.addProperty("layout", "split-gzip-modules");
            storage.addProperty("compact_json", true);
            storage.addProperty("snapshot_schema", SNAPSHOT_SCHEMA);
            storage.addProperty("module_generation", generation);
            storage.addProperty("module_base", "modules/" + generation);
            storage.addProperty("module_url_template", "/api/matches/{match_id}/analysis/modules/{module}");
            storage.add("eager_modules", strings(available.stream().filter(EAGER_MODULES::contains).toList()));
            storage.add("lazy_modules", strings(available.stream().filter(name -> !EAGER_MODULES.contains(name)).toList()));
            storage.add("available_modules", strings(available));
            storage.add("module_files", moduleFiles);
            compact.add("analysis_storage", storage);

            Files.writeString(summaryPart, GSON.toJson(compact), StandardCharsets.UTF_8);
            return compact;
        } catch (IOException | RuntimeException error) {
            deleteTree(generationDirectory);
            throw error;
        }
    }

    static JsonObject readSummary(Path analysisDirectory) throws IOException {
        Path path = analysisDirectory.resolve("summary.json");
        if (!Files.isRegularFile(path)) return null;
        JsonElement parsed = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8));
        return parsed.isJsonObject() ? parsed.getAsJsonObject() : null;
    }

    static JsonElement readModule(Path analysisDirectory, JsonObject summary, String moduleName) throws IOException {
        if (!MODULE_NAMES.contains(moduleName)) return null;
        JsonObject storage = object(summary, "analysis_storage");
        String base = string(storage, "module_base");
        if (STORAGE_SCHEMA.equals(string(storage, "schema")) && base != null) {
            Path normalizedRoot = analysisDirectory.toAbsolutePath().normalize();
            Path path = normalizedRoot.resolve(base).resolve(moduleName + ".json.gz").normalize();
            if (path.startsWith(normalizedRoot) && Files.isRegularFile(path)) {
                try (GZIPInputStream input = new GZIPInputStream(Files.newInputStream(path));
                        InputStreamReader reader = new InputStreamReader(input, StandardCharsets.UTF_8)) {
                    return JsonParser.parseReader(reader);
                }
            }
        }
        JsonObject modules = object(summary, "modules");
        JsonElement embedded = modules.get(moduleName);
        return embedded == null ? null : embedded.deepCopy();
    }

    static JsonObject readWithModules(Path analysisDirectory, Set<String> moduleNames) throws IOException {
        JsonObject summary = readSummary(analysisDirectory);
        if (summary == null) return null;
        JsonObject modules = object(summary, "modules");
        summary.add("modules", modules);
        for (String name : moduleNames) {
            JsonElement module = readModule(analysisDirectory, summary, name);
            if (module != null) modules.add(name, module);
        }
        return summary;
    }

    static void cleanupInactiveGenerations(Path analysisDirectory, JsonObject summary) throws IOException {
        String active = string(object(summary, "analysis_storage"), "module_generation");
        Path modulesDirectory = analysisDirectory.resolve("modules");
        if (active == null || !Files.isDirectory(modulesDirectory)) return;
        try (var directories = Files.list(modulesDirectory)) {
            for (Path directory : directories.filter(Files::isDirectory).toList()) {
                if (!directory.getFileName().toString().equals(active)) deleteTree(directory);
            }
        }
    }

    static Set<String> moduleNames() {
        return new LinkedHashSet<>(MODULE_NAMES);
    }

    private static JsonObject packSnapshots(JsonElement source) {
        if (!source.isJsonObject()) return new JsonObject();
        JsonObject sourceObject = source.getAsJsonObject();
        if (SNAPSHOT_SCHEMA.equals(string(sourceObject, "schema"))) return sourceObject.deepCopy();

        Map<String, Integer> regionIds = new LinkedHashMap<>();
        JsonObject bySlot = new JsonObject();
        long samples = 0;
        for (Map.Entry<String, JsonElement> entry : sourceObject.entrySet()) {
            if (!entry.getValue().isJsonArray()) continue;
            JsonArray packedRows = new JsonArray();
            for (JsonElement value : entry.getValue().getAsJsonArray()) {
                if (!value.isJsonObject()) continue;
                JsonObject row = value.getAsJsonObject();
                JsonArray packed = new JsonArray();
                for (String field : SNAPSHOT_FIELDS) {
                    if (field.equals("region")) {
                        String region = string(row, field);
                        if (region == null) packed.add(JsonNull.INSTANCE);
                        else packed.add(regionIds.computeIfAbsent(region, ignored -> regionIds.size()));
                    } else {
                        JsonElement fieldValue = row.get(field);
                        packed.add(fieldValue == null ? JsonNull.INSTANCE : fieldValue.deepCopy());
                    }
                }
                packedRows.add(packed);
                samples++;
            }
            bySlot.add(entry.getKey(), packedRows);
        }

        JsonArray regions = new JsonArray();
        regionIds.keySet().forEach(regions::add);
        JsonObject packed = new JsonObject();
        packed.addProperty("schema", SNAPSHOT_SCHEMA);
        packed.add("fields", strings(SNAPSHOT_FIELDS));
        packed.add("regions", regions);
        packed.add("by_slot", bySlot);
        packed.addProperty("samples", samples);
        packed.addProperty("precision_seconds", 1);
        return packed;
    }

    private static void writeGzip(Path path, JsonElement value) throws IOException {
        try (GZIPOutputStream output = new GZIPOutputStream(Files.newOutputStream(path), 1024 * 256);
                OutputStreamWriter writer = new OutputStreamWriter(output, StandardCharsets.UTF_8)) {
            GSON.toJson(value, writer);
        }
    }

    private static JsonObject copyWithout(JsonObject source, String... excludedKeys) {
        Set<String> excluded = Set.of(excludedKeys);
        JsonObject target = new JsonObject();
        for (Map.Entry<String, JsonElement> entry : source.entrySet()) {
            if (!excluded.contains(entry.getKey())) target.add(entry.getKey(), entry.getValue().deepCopy());
        }
        return target;
    }

    private static void copyIfPresent(JsonObject source, JsonObject target, String name) {
        JsonElement value = source.get(name);
        if (value != null) target.add(name, value.deepCopy());
    }

    private static JsonObject object(JsonObject parent, String name) {
        JsonElement value = parent == null ? null : parent.get(name);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : new JsonObject();
    }

    private static String string(JsonObject object, String name) {
        JsonElement value = object == null ? null : object.get(name);
        return value == null || value.isJsonNull() ? null : value.getAsString();
    }

    private static JsonArray strings(List<String> values) {
        JsonArray result = new JsonArray();
        values.forEach(result::add);
        return result;
    }

    private static void moveReplacing(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void deleteTree(Path directory) throws IOException {
        if (!Files.exists(directory)) return;
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }
}
