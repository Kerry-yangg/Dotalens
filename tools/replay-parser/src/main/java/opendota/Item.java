package opendota;

public class Item {
    public String id;
    public Integer ehandle;
    // Charges can be used to determine how many items are stacked together on
    // stackable items
    public Integer slot;
    public Integer num_charges;
    // item_ward_dispenser uses num_charges for observer wards
    // and num_secondary_charges for sentry wards count
    // and is considered not stackable
    public Integer num_secondary_charges;
    public Float cooldown;
    public Float cooldown_length;
}
