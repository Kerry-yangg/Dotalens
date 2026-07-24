package opendota;

import java.io.IOException;
import java.io.StringReader;
import java.util.Set;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonSyntaxException;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;

/** Parses only selected top-level fields while still validating the complete JSON object. */
final class JsonLineProjection {
    private static final String COMPACT_TYPE_PREFIX = "\"type\":\"";

    private JsonLineProjection() {
    }

    static JsonObject parse(String line, Set<String> selectedFields) {
        try (JsonReader reader = new JsonReader(new StringReader(line))) {
            reader.setLenient(false);
            if (reader.peek() != JsonToken.BEGIN_OBJECT) {
                throw new JsonSyntaxException("JSONL row is not an object");
            }
            JsonObject result = new JsonObject();
            reader.beginObject();
            while (reader.hasNext()) {
                String name = reader.nextName();
                if (selectedFields.contains(name)) {
                    result.add(name, JsonParser.parseReader(reader));
                } else {
                    reader.skipValue();
                }
            }
            reader.endObject();
            if (reader.peek() != JsonToken.END_DOCUMENT) {
                throw new JsonSyntaxException("Trailing content after JSONL object");
            }
            return result;
        } catch (IOException | IllegalStateException error) {
            throw new JsonSyntaxException("Invalid JSONL row", error);
        }
    }

    static String compactType(String line) {
        int prefix = line.indexOf(COMPACT_TYPE_PREFIX);
        if (prefix < 0) return null;
        int start = prefix + COMPACT_TYPE_PREFIX.length();
        int end = line.indexOf('"', start);
        return end < 0 ? null : line.substring(start, end);
    }
}
