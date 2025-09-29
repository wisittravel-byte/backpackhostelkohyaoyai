package com.example.hostel.repo;

import com.example.hostel.dto.RateRow;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Repository
public class RatesDao {
    private final NamedParameterJdbcTemplate jdbc;

    @Value("${app.rates.table:rates}")
    private String table;

    // Allow overriding column names to match existing schema
    @Value("${app.rates.columns.id:id}")
    private String colId;
    @Value("${app.rates.columns.propertyId:property_id}")
    private String colPropertyId;
    @Value("${app.rates.columns.roomTypeId:room_type_id}")
    private String colRoomTypeId;
    @Value("${app.rates.columns.ratePlanId:rate_plan_id}")
    private String colRatePlanId;
    @Value("${app.rates.columns.stayDate:stay_date}")
    private String colStayDate;
    @Value("${app.rates.columns.currency:currency}")
    private String colCurrency;
    @Value("${app.rates.columns.price:price}")
    private String colPrice;
    @Value("${app.rates.columns.taxIncluded:tax_included}")
    private String colTaxIncluded;
    @Value("${app.rates.columns.createdAt:created_at}")
    private String colCreatedAt;

    public RatesDao(NamedParameterJdbcTemplate jdbc){ this.jdbc = jdbc; }

    public List<RateRow> find(LocalDate from, LocalDate to, Integer propertyId, Integer roomTypeId, Integer ratePlanId, List<Long> ids){
        StringBuilder sql = new StringBuilder("SELECT ")
                .append(colId).append(" AS id,")
                .append(colPropertyId).append(" AS property_id,")
                .append(colRoomTypeId).append(" AS room_type_id,")
                .append(colRatePlanId).append(" AS rate_plan_id,")
                .append(colStayDate).append(" AS stay_date,")
                .append(colCurrency).append(" AS currency,")
                .append(colPrice).append(" AS price,")
                .append(colTaxIncluded).append(" AS tax_included,")
                .append(colCreatedAt).append(" AS created_at FROM ")
                .append(table)
                .append(" WHERE 1=1");
        MapSqlParameterSource p = new MapSqlParameterSource();
        if(from!=null){ sql.append(" AND ").append(colStayDate).append(" >= :from"); p.addValue("from", from); }
        if(to!=null){ sql.append(" AND ").append(colStayDate).append(" <= :to"); p.addValue("to", to); }
        if(propertyId!=null){ sql.append(" AND ").append(colPropertyId).append(" = :pid"); p.addValue("pid", propertyId); }
        if(roomTypeId!=null){ sql.append(" AND ").append(colRoomTypeId).append(" = :rid"); p.addValue("rid", roomTypeId); }
        if(ratePlanId!=null){ sql.append(" AND ").append(colRatePlanId).append(" = :rpid"); p.addValue("rpid", ratePlanId); }
        if(ids!=null && !ids.isEmpty()){
            sql.append(" AND ").append(colId).append(" IN (:ids)");
            p.addValue("ids", ids);
        }
        sql.append(" ORDER BY ").append(colStayDate).append(" ASC, ").append(colRoomTypeId).append(" ASC, ").append(colRatePlanId).append(" ASC");
        return jdbc.query(sql.toString(), p, RatesDao::map);
    }

    private static RateRow map(ResultSet rs, int rowNum) throws SQLException {
        RateRow r = new RateRow();
        r.id = rs.getLong("id");
        r.propertyId = (Integer)rs.getObject("property_id");
        r.roomTypeId = (Integer)rs.getObject("room_type_id");
        r.ratePlanId = (Integer)rs.getObject("rate_plan_id");
        r.stayDate = rs.getObject("stay_date", LocalDate.class);
        r.currency = rs.getString("currency");
        r.price = rs.getBigDecimal("price");
        r.taxIncluded = (Integer)rs.getObject("tax_included");
        r.createdAt = (OffsetDateTime)rs.getObject("created_at", OffsetDateTime.class);
        return r;
    }
}
