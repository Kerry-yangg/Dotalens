package opendota;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/** Rebuilds the compact desktop summary from an existing raw Replay JSONL. */
public final class SummaryCli {
    private SummaryCli() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 4) {
            System.err.println("Usage: SummaryCli <raw.jsonl> <match.json> <account-id> <summary.json>");
            System.exit(2);
        }
        Path raw = Path.of(args[0]);
        Path match = Path.of(args[1]);
        long accountId = Long.parseLong(args[2]);
        Path output = Path.of(args[3]);
        JsonObject matchDetail = JsonParser.parseString(Files.readString(match, StandardCharsets.UTF_8))
                .getAsJsonObject();
        JsonObject summary = AnalysisSummary.build(raw, matchDetail, accountId);
        Gson gson = new GsonBuilder().disableHtmlEscaping().create();
        Files.writeString(output, gson.toJson(summary), StandardCharsets.UTF_8);
        System.out.println(output.toAbsolutePath());
    }
}
