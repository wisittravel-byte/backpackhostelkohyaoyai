# Simple container for Spring Boot app
# Build with: docker build -t hostel-app .
# Run with: docker run -p 8081:8081 --env DB_HOST=host --env DB_USER=user --env DB_PASS=pass hostel-app

FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy built jar (use mvn -DskipTests package)
ARG JAR_FILE=target/*.jar
COPY ${JAR_FILE} app.jar

EXPOSE 8081
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0"
ENTRYPOINT ["sh","-c","java $JAVA_OPTS -jar app.jar"]
