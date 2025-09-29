package com.example.hostel.web;

import com.example.hostel.dto.RoomTypeRow;
import com.example.hostel.repo.RoomTypesDao;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/room-types")
public class RoomTypesController {
    private final RoomTypesDao dao;
    public RoomTypesController(RoomTypesDao dao){ this.dao = dao; }

    @GetMapping
    public List<RoomTypeRow> list(@RequestParam(required = false) Integer propertyId){
        return dao.listByProperty(propertyId);
    }
}
