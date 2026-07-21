package opendota;

import java.util.List;
import java.util.Map;

public class Entry implements Cloneable {
    public Integer time = 0;
    // Dota Lens event clock. `time` remains for upstream blob compatibility.
    public Integer demo_tick;
    public Long raw_game_time_ms;
    public Long game_time_ms;
    public Long event_seq;
    public Float raw_time;
    public String type;
    public Integer team;
    public String unit;
    public String unit_kind;
    public String key;
    public Integer value;
    public Float floatValue;
    public Boolean booleanValue;
    public Integer slot;
    public Integer player_slot;
    // chat event fields
    public Integer player1;
    public Integer player2;
    // combat log fields
    public String attackername;
    public String targetname;
    public String sourcename;
    public String targetsourcename;
    public Boolean attackerhero;
    public Boolean targethero;
    public Boolean attackerillusion;
    public Boolean targetillusion;
    public Integer abilitylevel;
    public String inflictor;
    public Boolean visible_radiant;
    public Boolean visible_dire;
    public Integer event_health;
    public Boolean ability_toggle_on;
    public Boolean ability_toggle_off;
    public Float event_x;
    public Float event_y;
    public Float modifier_duration;
    public Integer event_last_hits;
    public Integer attacker_team;
    public Integer target_team;
    public Integer obs_wards_placed;
    public List<Integer> assist_players;
    public Integer stack_count;
    public Boolean hidden_modifier;
    public Boolean target_building;
    public Integer neutral_camp_type;
    public Integer rune_type;
    public Boolean heal_save;
    public Boolean ultimate_ability;
    public Integer attacker_hero_level;
    public Integer target_hero_level;
    public Integer event_xpm;
    public Integer event_gpm;
    public Integer event_location;
    public Boolean target_self;
    public Integer damage_type;
    public Boolean invisibility_modifier;
    public Integer damage_category;
    public Integer event_networth;
    public Integer building_type;
    public Float modifier_elapsed_duration;
    public Boolean silence_modifier;
    public Boolean heal_from_lifesteal;
    public Boolean modifier_purged;
    public Boolean spell_evaded;
    public Boolean motion_controller_modifier;
    public Boolean long_range_kill;
    public Integer modifier_purge_ability;
    public Integer modifier_purge_npc;
    public Boolean root_modifier;
    public Integer total_unit_death_count;
    public Boolean aura_modifier;
    public Boolean armor_debuff_modifier;
    public Boolean no_physical_damage_modifier;
    public Integer modifier_ability;
    public Boolean modifier_hidden;
    public Boolean inflictor_stolen_ability;
    public Integer kill_eater_event;
    public Integer unit_status_label;
    public Boolean spell_generated_attack;
    public Boolean at_night_time;
    public Boolean attacker_has_scepter;
    public Integer neutral_camp_team;
    public Float regenerated_health;
    public Boolean will_reincarnate;
    public Boolean uses_charges;
    public Integer tracked_stat_id;
    public Float modifier_purged_duration;
    public Boolean heal_from_regen;
    public Integer gold_reason;
    public Integer xp_reason;
    public String valuename;
    // Unit order fields.
    public Integer issuer_index;
    public Integer order_type;
    public List<Integer> units;
    public List<Integer> unit_ehandles;
    public Integer target_index;
    public Integer target_ehandle;
    public Integer ability_id;
    public Float order_x;
    public Float order_y;
    public Float order_z;
    public Boolean queued;
    public Integer order_sequence;
    public Long order_flags;
    public Long last_order_latency;
    public Long ping;
    // public Float stun_duration;
    // public Float slow_duration;
    // entity fields
    public Integer gold;
    public Integer lh;
    public Integer xp;
    public Float x;
    public Float y;
    public Float z;
    public Float stuns;
    public Integer hero_id;
    public Integer variant;
    public Integer facet_hero_id;
    public List<Item> hero_inventory;
    public List<AbilityState> hero_abilities;
    public Integer itemslot;
    public Integer charges;
    public Integer secondary_charges;
    public Float hp;
    public Float max_hp;
    public Float mana;
    public Float max_mana;
    public Integer move_speed;
    public Integer life_state;
    public Integer level;
    public Integer kills;
    public Integer deaths;
    public Integer assists;
    public Integer denies;
    public Boolean entityleft;
    public Integer ehandle;
    public Integer entity_index;
    public Integer owner_ehandle;
    public Integer owner_slot;
    public Integer visible_by_team;
    public Integer day_vision_range;
    public Integer night_vision_range;
    public Integer fow_team;
    public Float reveal_radius;
    public Boolean selection_ring_visible;
    public Long ward_lifetime_ms;
    public String ward_end_reason;
    public Float ward_end_reason_confidence;
    public Boolean isNeutralActiveDrop;
    public Boolean isNeutralPassiveDrop;
    public Integer obs_placed;
    public Integer sen_placed;
    public Integer creeps_stacked;
    public Integer camps_stacked;
    public Integer rune_pickups;
    public Boolean repicked;
    public Boolean randomed;
    public Boolean pred_vict;
    public Float stun_duration;
    public Float slow_duration;
    public Boolean tracked_death;
    public Integer greevils_greed_stack;
    public String tracked_sourcename;
    public Integer firstblood_claimed;
    public Float teamfight_participation;
    public Integer towers_killed;
    public Integer roshans_killed;
    public Integer observers_placed;
    public Integer draft_order;
    public Boolean pick;
    public Integer draft_active_team;
    public Integer draft_extime0;
    public Integer draft_extime1;
    public Integer networth;
    public Integer stage;
    public Boolean posData;
    public Boolean max;
    public Boolean interval;
    public String event;
    public Integer killer;
    // Schema probe payload. Values are raw entity properties, not derived data.
    public String schema_category;
    public Map<String, Object> fields;

    public Entry() {
    }

    public Entry(Integer time) {
        this.time = time;
    }

    @Override
    protected Object clone() throws CloneNotSupportedException {
        return super.clone();
    }
}
