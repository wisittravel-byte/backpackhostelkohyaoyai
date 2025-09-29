Backend (Spring Boot + MySQL)

1) Configure database in src/main/resources/application.properties
   - spring.datasource.url=jdbc:mysql://localhost:3306/hostel
   - spring.datasource.username=hostel_user
   - spring.datasource.password=hostel_pass

2) Create database and user in MySQL (example):
   CREATE DATABASE hostel CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'hostel_user'@'localhost' IDENTIFIED BY 'hostel_pass';
   GRANT ALL PRIVILEGES ON hostel.* TO 'hostel_user'@'localhost';
   FLUSH PRIVILEGES;

3) Run the app (Windows, Maven):
   mvn spring-boot:run

4) Test APIs:
   GET  http://localhost:8081/api/health
   GET  http://localhost:8081/api/bookings
   POST http://localhost:8081/api/bookings
   {"checkIn":"2025-10-01","checkOut":"2025-10-03","guests":2,"rooms":1,"roomType":"dorm","email":"you@example.com","firstName":"A","lastName":"B"}

5) Frontend CORS origins allowed: 127.0.0.1:5500, localhost:5500, wisittravel-byte.github.io
