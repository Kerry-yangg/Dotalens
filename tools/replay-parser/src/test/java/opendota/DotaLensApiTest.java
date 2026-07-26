package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpServer;

class DotaLensApiTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void selectsAndReadsAMatchSubjectWithoutReparsing() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("500");
        Files.createDirectories(analysisDirectory);
        Files.writeString(analysisDirectory.resolve("summary.json"), """
                {
                  "schema":"dota-lens/0.8",
                  "account_id":999,
                  "match":{
                    "match_id":500,
                    "players":[
                      {"player_slot":0,"account_id":111,"hero_id":1},
                      {"player_slot":128,"account_id":222,"hero_id":2}
                    ]
                  },
                  "modules":{"schema":"product-modules/2.4"}
                }
                """, StandardCharsets.UTF_8);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        DotaLensApi api = new DotaLensApi(
                new OpenDotaClient("http://127.0.0.1:1", ""), temporaryDirectory);
        api.register(server);
        server.start();
        try {
            URI subjectUri = URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                    + "/api/matches/500/subject");
            HttpResponse<String> selected = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(subjectUri)
                            .header("Content-Type", "application/json")
                            .PUT(HttpRequest.BodyPublishers.ofString("{\"player_slot\":128}"))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());

            assertEquals(200, selected.statusCode());
            JsonObject subject = JsonParser.parseString(selected.body()).getAsJsonObject();
            assertEquals("manual_selected", subject.get("status").getAsString());

            HttpResponse<String> analysisResponse = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                                    + server.getAddress().getPort()
                                    + "/api/matches/500/analysis"))
                            .GET()
                            .build(),
                    HttpResponse.BodyHandlers.ofString());
            assertEquals(200, analysisResponse.statusCode());
            JsonObject analysis = JsonParser.parseString(analysisResponse.body()).getAsJsonObject();
            assertEquals(128, analysis.getAsJsonObject("match")
                    .get("selected_player_slot").getAsInt());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void subjectPersistenceFailureReturnsStructuredServerError() throws Exception {
        Path analysisDirectory = temporaryDirectory.resolve("analyses").resolve("501");
        Files.createDirectories(analysisDirectory);
        Files.writeString(analysisDirectory.resolve("summary.json"), """
                {
                  "schema":"dota-lens/0.8",
                  "match":{
                    "match_id":501,
                    "players":[
                      {"player_slot":0,"account_id":111,"hero_id":1},
                      {"player_slot":128,"account_id":222,"hero_id":2}
                    ]
                  },
                  "modules":{"schema":"product-modules/2.4"}
                }
                """, StandardCharsets.UTF_8);
        Files.createDirectory(analysisDirectory.resolve("subject.json.part"));

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        DotaLensApi api = new DotaLensApi(
                new OpenDotaClient("http://127.0.0.1:1", ""), temporaryDirectory);
        api.register(server);
        server.start();
        try {
            URI subjectUri = URI.create("http://127.0.0.1:" + server.getAddress().getPort()
                    + "/api/matches/501/subject");
            HttpResponse<String> response = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(subjectUri)
                            .header("Content-Type", "application/json")
                            .PUT(HttpRequest.BodyPublishers.ofString("{\"player_slot\":128}"))
                            .build(),
                    HttpResponse.BodyHandlers.ofString());

            assertEquals(500, response.statusCode());
            JsonObject error = JsonParser.parseString(response.body()).getAsJsonObject();
            assertEquals("subject_write_failed", error.get("error").getAsString());
        } finally {
            server.stop(0);
        }
    }
}
