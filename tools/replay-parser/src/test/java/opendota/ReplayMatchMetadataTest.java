package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.google.gson.JsonObject;

class ReplayMatchMetadataTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void reconstructsPrivateMatchAndPlayersFromReplayEvents() throws Exception {
        Path raw = temporaryDirectory.resolve("9973575401.raw.jsonl");
        String epilogue = """
                {"gameInfo_":{"dota_":{"matchId_":9973575401,"gameMode_":22,"gameWinner_":2,"endTime_":1785001000,"playerInfo_":[
                  {"heroName_":{"bytes":[110,112,99,95,100,111,116,97,95,104,101,114,111,95,97,120,101]},"playerName_":{"bytes":[-26,-75,-117,-24,-81,-107]},"steamid_":76561198060001482,"gameTeam_":2},
                  {"heroName_":{"bytes":[110,112,99,95,100,111,116,97,95,104,101,114,111,95,108,105,110,97]},"playerName_":{"bytes":[68,105,114,101]},"steamid_":76561198060201482,"gameTeam_":3}
                ]}}}
                """.replace("\n", "");
        Files.writeString(raw, String.join("\n",
                "{\"type\":\"interval\",\"time\":1800,\"slot\":0,\"team\":2,\"hero_id\":2,\"gold\":18000,\"xp\":21000,\"lh\":250,\"denies\":15,\"level\":22,\"kills\":10,\"deaths\":2,\"assists\":12,\"networth\":18500,\"stuns\":30.5,\"towers_killed\":2,\"roshans_killed\":1}",
                "{\"type\":\"interval\",\"time\":1800,\"slot\":5,\"team\":3,\"hero_id\":25,\"gold\":15000,\"xp\":19000,\"lh\":220,\"denies\":8,\"level\":20,\"kills\":5,\"deaths\":7,\"assists\":9,\"networth\":15400}",
                "{\"type\":\"epilogue\",\"key\":" + new com.google.gson.Gson().toJson(epilogue) + "}",
                ""), StandardCharsets.UTF_8);

        JsonObject reconstructed = ReplayMatchMetadata.enrich(raw, new JsonObject(), 9973575401L);

        assertEquals(9973575401L, reconstructed.get("match_id").getAsLong());
        assertEquals(9973575401L, reconstructed.get("replay_match_id").getAsLong());
        assertEquals(1785001000L, reconstructed.get("replay_end_time").getAsLong());
        assertEquals(22, reconstructed.get("game_mode").getAsInt());
        assertTrue(reconstructed.get("radiant_win").getAsBoolean());
        assertEquals(1800, reconstructed.get("duration").getAsInt());
        assertEquals("local_replay", reconstructed.get("metadata_source").getAsString());
        JsonObject radiant = reconstructed.getAsJsonArray("players").get(0).getAsJsonObject();
        assertEquals(99735754L, radiant.get("account_id").getAsLong());
        assertEquals("测试", radiant.get("personaname").getAsString());
        assertEquals(2, radiant.get("hero_id").getAsInt());
        assertEquals(10, radiant.get("kills").getAsInt());
        assertEquals(600, radiant.get("gold_per_min").getAsInt());
        assertEquals(700, radiant.get("xp_per_min").getAsInt());
        assertEquals(0, radiant.get("player_slot").getAsInt());
        assertEquals(128, reconstructed.getAsJsonArray("players").get(1).getAsJsonObject()
                .get("player_slot").getAsInt());
    }

    @Test
    void keepsAuthoritativeOpenDotaFieldsWhileFillingReplayGaps() throws Exception {
        Path raw = temporaryDirectory.resolve("42.raw.jsonl");
        Files.writeString(raw,
                "{\"type\":\"interval\",\"time\":60,\"slot\":0,\"team\":2,\"hero_id\":2,\"gold\":600,\"xp\":500}\n",
                StandardCharsets.UTF_8);
        JsonObject source = new JsonObject();
        source.addProperty("match_id", 42);
        source.addProperty("duration", 90);
        source.addProperty("patch_name", "7.41d");

        JsonObject enriched = ReplayMatchMetadata.enrich(raw, source, 42L);

        assertEquals(90, enriched.get("duration").getAsInt());
        assertEquals("7.41d", enriched.get("patch_name").getAsString());
        assertEquals("opendota_plus_replay", enriched.get("metadata_source").getAsString());
    }

    @Test
    void exposesTheReplayIdentityEvenWhenDeclaredMetadataDisagrees() throws Exception {
        Path raw = temporaryDirectory.resolve("declared.raw.jsonl");
        String epilogue = """
                {"gameInfo_":{"dota_":{"matchId_":9002,"endTime_":1785001000}}}
                """.replace("\n", "");
        Files.writeString(raw,
                "{\"type\":\"epilogue\",\"key\":"
                        + new com.google.gson.Gson().toJson(epilogue) + "}\n",
                StandardCharsets.UTF_8);
        JsonObject declared = new JsonObject();
        declared.addProperty("match_id", 9001L);

        JsonObject enriched = ReplayMatchMetadata.enrich(raw, declared, 9001L);

        assertEquals(9001L, enriched.get("match_id").getAsLong());
        assertEquals(9002L, enriched.get("replay_match_id").getAsLong());
    }
}
