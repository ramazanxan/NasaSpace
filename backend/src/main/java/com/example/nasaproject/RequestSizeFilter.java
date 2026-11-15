package com.example.nasaproject;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** Rejects request bodies larger than {@code mars.max-body-bytes}: a route request is a few hundred bytes. */
@Component
public class RequestSizeFilter extends OncePerRequestFilter {

    private final long maxBytes;

    public RequestSizeFilter(@Value("${mars.max-body-bytes:8192}") long maxBytes) {
        this.maxBytes = maxBytes;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        long len = req.getContentLengthLong();
        boolean chunked = len < 0 && "chunked".equalsIgnoreCase(req.getHeader("Transfer-Encoding"));
        if (len > maxBytes || chunked) {
            res.setStatus(413);
            res.setContentType(MediaType.APPLICATION_JSON_VALUE);
            res.setCharacterEncoding("UTF-8");
            res.getWriter().write("{\"error\":\"INVALID_PARAMETER\",\"message\":\"The request body is too large. "
                    + "Send only start, goal and the route options.\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
