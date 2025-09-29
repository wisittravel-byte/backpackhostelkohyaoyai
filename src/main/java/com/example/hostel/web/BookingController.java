package com.example.hostel.web;

import com.example.hostel.model.Booking;
import com.example.hostel.service.BookingService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {
    private final BookingService service;
    public BookingController(BookingService service){ this.service = service; }

    @GetMapping
    public List<Booking> list(){ return service.list(); }

    @GetMapping("/{id}")
    public ResponseEntity<Booking> get(@PathVariable Long id){
        Booking b = service.get(id);
        return (b==null) ? ResponseEntity.notFound().build() : ResponseEntity.ok(b);
    }

    @PostMapping
    public ResponseEntity<Booking> create(@Valid @RequestBody Booking b){
        Booking saved = service.create(b);
        return ResponseEntity.created(URI.create("/api/bookings/"+saved.getId())).body(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id){
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
