package com.example.hostel.repo;

import com.example.hostel.model.Booking;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BookingRepository extends JpaRepository<Booking, Long> { }
