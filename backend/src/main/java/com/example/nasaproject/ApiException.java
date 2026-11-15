package com.example.nasaproject;

import org.springframework.http.HttpStatus;

/** Ошибка с HTTP-статусом и машинным кодом для фронта. */
public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() { return status; }
    public String getCode() { return code; }
}
