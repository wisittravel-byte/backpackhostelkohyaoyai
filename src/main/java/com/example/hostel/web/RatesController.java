package com.example.hostel.web;

import com.example.hostel.dto.RateRow;
import com.example.hostel.repo.RatesDao;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/rates")
public class RatesController {
    private final RatesDao dao;
    public RatesController(RatesDao dao){ this.dao = dao; }

    @GetMapping
    public List<RateRow> list(
            @RequestParam(required = false) @DateTimeFormat(iso= DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso= DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Integer propertyId,
            @RequestParam(required = false) Integer roomTypeId,
            @RequestParam(required = false) Integer ratePlanId,
            @RequestParam(required = false) List<Long> ids
    ){
        // If only one bound provided, use it for both (single day)
        if(from != null && to == null) to = from;
        if(to != null && from == null) from = to;
        return dao.find(from, to, propertyId, roomTypeId, ratePlanId, ids);
    }
}
