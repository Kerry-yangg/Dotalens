package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Set;

import org.junit.jupiter.api.Test;

import com.google.gson.JsonSyntaxException;

class JsonLineProjectionTest {
    @Test
    void keepsSelectedFieldsAndSkipsNestedActionPayloads() {
        String line = """
                {"type":"actions","slot":3,"game_time_ms":62000,"units":[1,2,3],
                "target":{"index":42,"position":[100.5,200.5]},"event_seq":99}
                """;

        var projected = JsonLineProjection.parse(line, Set.of(
                "type", "slot", "game_time_ms", "event_seq"));

        assertEquals("actions", projected.get("type").getAsString());
        assertEquals(3, projected.get("slot").getAsInt());
        assertEquals(62000L, projected.get("game_time_ms").getAsLong());
        assertEquals(99L, projected.get("event_seq").getAsLong());
        assertFalse(projected.has("units"));
        assertFalse(projected.has("target"));
    }

    @Test
    void rejectsMalformedRowsEvenWhenTheBrokenFieldIsNotSelected() {
        assertThrows(JsonSyntaxException.class, () -> JsonLineProjection.parse(
                "{\"type\":\"actions\",\"units\":[1,2,}",
                Set.of("type")));
    }

    @Test
    void extractsCompactGeneratedEventTypesWithoutParsingTheWholeRow() {
        assertEquals("interval", JsonLineProjection.compactType(
                "{\"time\":1,\"type\":\"interval\",\"hero_inventory\":[1,2,3]}"));
    }
}
