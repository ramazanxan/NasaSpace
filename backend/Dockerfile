FROM maven:3.9.11-eclipse-temurin-25 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
COPY data ./data
RUN mvn --batch-mode --no-transfer-progress -DskipTests package

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /workspace/target/NasaProject-0.0.1-SNAPSHOT.jar app.jar
COPY --from=build /workspace/data ./data
EXPOSE 9090
USER 10001
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
