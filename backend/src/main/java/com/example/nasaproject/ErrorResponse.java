package com.example.nasaproject;

/** Тело ошибки: error — стабильный код для if/switch на фронте, message — текст для человека. */
public record ErrorResponse(String error, String message) {}
