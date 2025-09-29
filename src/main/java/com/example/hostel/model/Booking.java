package com.example.hostel.model;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.time.LocalDate;

@Entity
@Table(name = "bookings")
public class Booking {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    private LocalDate checkIn;

    @NotNull
    private LocalDate checkOut;

    @Min(1)
    private int guests;

    @Min(1)
    private int rooms;

    @Size(max = 32)
    private String roomType; // dorm/private/family

    @Email
    @Size(max = 120)
    private String email;

    @Size(max = 60)
    private String firstName;

    @Size(max = 60)
    private String lastName;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LocalDate getCheckIn() { return checkIn; }
    public void setCheckIn(LocalDate checkIn) { this.checkIn = checkIn; }
    public LocalDate getCheckOut() { return checkOut; }
    public void setCheckOut(LocalDate checkOut) { this.checkOut = checkOut; }
    public int getGuests() { return guests; }
    public void setGuests(int guests) { this.guests = guests; }
    public int getRooms() { return rooms; }
    public void setRooms(int rooms) { this.rooms = rooms; }
    public String getRoomType() { return roomType; }
    public void setRoomType(String roomType) { this.roomType = roomType; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
}
