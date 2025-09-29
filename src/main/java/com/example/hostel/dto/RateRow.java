package com.example.hostel.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public class RateRow {
    public Long id;
    public Integer propertyId;
    public Integer roomTypeId;
    public Integer ratePlanId;
    public LocalDate stayDate;
    public String currency;
    public BigDecimal price;
    public Integer taxIncluded; // 0/1
    public OffsetDateTime createdAt;
}
