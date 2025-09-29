package com.example.hostel.repo;

import com.example.hostel.dto.RoomTypeRow;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Repository
public class RoomTypesDao {
    private static final Logger log = LoggerFactory.getLogger(RoomTypesDao.class);
    private final NamedParameterJdbcTemplate jdbc;

    public RoomTypesDao(NamedParameterJdbcTemplate jdbc){ this.jdbc = jdbc; }

    @Value("${app.roomtypes.table:room_types}")
    private String table;

    @Value("${app.roomtypes.columns.id:id}")
    private String colId;
    @Value("${app.roomtypes.columns.propertyId:property_id}")
    private String colPropertyId;
    @Value("${app.roomtypes.columns.code:code}")
    private String colCode;
    @Value("${app.roomtypes.columns.name:name}")
    private String colName;
    @Value("${app.roomtypes.columns.description:description}")
    private String colDesc;
    @Value("${app.roomtypes.columns.imageUrl:image_url}")
    private String colImage;

    private boolean metaLoaded = false;
    private Set<String> existingCols = new HashSet<>();
    private String schemaName;
    private String tableName;

    private void ensureMetadata(){
        if(metaLoaded) return;
        try{
            // Determine schema.table
            String t = table;
            if(t.contains(".")){
                String[] parts = t.split("\\.",2);
                schemaName = parts[0];
                tableName = parts[1];
            }else{
                // fallback: current schema
                schemaName = jdbc.getJdbcOperations().queryForObject("SELECT DATABASE()", String.class);
                tableName = t;
            }
            List<String> cols = jdbc.getJdbcOperations().query(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?",
                    (rs, rn) -> rs.getString(1), schemaName, tableName);
            existingCols = new HashSet<>(cols);
        }catch(Exception ex){
            // Fallback: assume configured columns exist to avoid hard failure
            existingCols = new HashSet<>();
            existingCols.add(colId);
            existingCols.add(colPropertyId);
            existingCols.add(colCode);
            existingCols.add(colName);
            existingCols.add(colDesc);
            existingCols.add(colImage);
        }finally{
            metaLoaded = true;
        }
    }

    public List<RoomTypeRow> listByProperty(Integer propertyId){
        ensureMetadata();
        // Resolve each requested column if it exists; otherwise select NULL
        String cId = existingCols.contains(colId) ? colId : "NULL";
        String cPid = existingCols.contains(colPropertyId) ? colPropertyId : "NULL";
        String cCode = existingCols.contains(colCode) ? colCode : "NULL";
        String cName = existingCols.contains(colName) ? colName : "NULL";
        String cDesc = existingCols.contains(colDesc) ? colDesc : "NULL";
        String cImg = existingCols.contains(colImage) ? colImage : "NULL";

        StringBuilder sql = new StringBuilder("SELECT ")
                .append(cId).append(" AS id,")
                .append(cPid).append(" AS property_id,")
                .append(cCode).append(" AS code,")
                .append(cName).append(" AS name,")
                .append(cDesc).append(" AS description,")
                .append(cImg).append(" AS image_url FROM ")
                .append(table)
                .append(" WHERE 1=1");
        MapSqlParameterSource p = new MapSqlParameterSource();
        if(propertyId != null && existingCols.contains(colPropertyId)){
            sql.append(" AND ").append(colPropertyId).append(" = :pid");
            p.addValue("pid", propertyId);
        }
        sql.append(" ORDER BY ").append(existingCols.contains(colId) ? colId : "1").append(" ASC");
        try{
            return jdbc.query(sql.toString(), p, RoomTypesDao::map);
        }catch(Exception ex){
            log.warn("Primary room_types query failed, using fallback simple query. table={}, error={}", table, ex.toString());
            String fb = "SELECT id AS id, property_id AS property_id, code AS code, name AS name, description AS description, NULL AS image_url FROM "
                    + table + (propertyId!=null ? " WHERE property_id = :pid" : "") + " ORDER BY id ASC";
            return jdbc.query(fb, p, RoomTypesDao::map);
        }
    }

    private static RoomTypeRow map(ResultSet rs, int rowNum) throws SQLException {
        RoomTypeRow r = new RoomTypeRow();
        // id may be INT/BIGINT/DECIMAL -> use Number
        Object idObj = rs.getObject("id");
        if(idObj instanceof Number) r.id = ((Number)idObj).longValue();
        else if(idObj == null) r.id = null; else r.id = Long.valueOf(idObj.toString());

        // property_id may be returned as BigInteger/Long/etc.
        Object pidObj = rs.getObject("property_id");
        if(pidObj instanceof Number) r.propertyId = ((Number)pidObj).intValue();
        else if(pidObj == null) r.propertyId = null; else r.propertyId = Integer.valueOf(pidObj.toString());
        r.code = rs.getString("code");
        r.name = rs.getString("name");
        r.description = rs.getString("description");
        r.imageUrl = rs.getString("image_url");
        return r;
    }
}
