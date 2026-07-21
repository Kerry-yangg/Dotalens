package opendota;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.google.gson.Gson;

class EntrySerializationTest {
    @Test
    void serializesDecisionStateAndClockFields() {
        Item item = new Item();
        item.id = "item_blink";
        item.slot = 0;
        item.cooldown = 8.5f;

        AbilityState ability = new AbilityState();
        ability.id = "axe_berserkers_call";
        ability.ability_level = 4;
        ability.cooldown = 2.25f;

        Entry entry = new Entry(120);
        entry.type = "interval";
        entry.demo_tick = 3600;
        entry.raw_game_time_ms = 130_000L;
        entry.game_time_ms = 120_000L;
        entry.event_seq = 42L;
        entry.hero_inventory = List.of(item);
        entry.hero_abilities = List.of(ability);

        String json = new Gson().toJson(entry);
        assertTrue(json.contains("\"game_time_ms\":120000"));
        assertTrue(json.contains("\"hero_inventory\""));
        assertTrue(json.contains("\"item_blink\""));
        assertTrue(json.contains("\"hero_abilities\""));
        assertTrue(json.contains("\"axe_berserkers_call\""));
    }
}
