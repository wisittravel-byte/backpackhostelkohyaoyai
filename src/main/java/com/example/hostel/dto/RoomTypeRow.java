package com.example.hostel.dto;

public class RoomTypeRow {
    public Long id;
    public Integer propertyId;
    public String code;       // optional: slug/code
    public String name;       // display name
    public String description; // optional
    public String imageUrl;   // optional
}
