package com.example.hostel.service;

import com.example.hostel.model.Booking;
import com.example.hostel.repo.BookingRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class BookingService {
    private final BookingRepository repo;
    public BookingService(BookingRepository repo){ this.repo = repo; }

    public Booking create(Booking b){ return repo.save(b); }
    public List<Booking> list(){ return repo.findAll(); }
    public Booking get(Long id){ return repo.findById(id).orElse(null); }
    public void delete(Long id){ repo.deleteById(id); }
}
