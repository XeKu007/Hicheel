"use client";

import { useEffect, useRef } from "react";

/**
 * Auth Honeypot — sign-in/sign-up хуудсанд нуугдмал field нэмдэг.
 *
 * Хэрхэн ажилладаг:
 * - CSS-ээр нуугдсан input field байна
 * - Жинхэнэ хэрэглэгч хэзээ ч энийг бөглөхгүй
 * - Bot автоматаар бүх field-ийг бөглөдөг
 * - Бөглөгдсөн бол /api/honeypot руу мэдэгдэж IP блоклодог
 *
 * Нэмэлт: sign-in хуудсанд хэт олон оролдлого хийвэл rate limit мессеж харуулна.
 */
export default function AuthHoneypot() {
  const fieldRef = useRef<HTMLInputElement>(null);
  const reported = useRef(false);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    // Bot field-ийг бөглөсөн эсэхийг шалгана
    const check = () => {
      if (field.value && !reported.current) {
        reported.current = true;
        // Bot илрүүлсэн — сервер рүү мэдэгдэнэ
        fetch("/api/honeypot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "form-honeypot" }),
        }).catch(() => {});
      }
    };

    // Автоматаар бөглөгдсөн эсэхийг шалгах
    const timer = setTimeout(check, 500);
    field.addEventListener("input", check);

    return () => {
      clearTimeout(timer);
      field.removeEventListener("input", check);
    };
  }, []);

  return (
    // aria-hidden — screen reader-т харагдахгүй
    // tabIndex=-1 — keyboard navigation-д орохгүй
    // autocomplete=off — browser автоматаар бөглөхгүй (bot-д нөлөөлөхгүй)
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "-9999px",
        top: "-9999px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
    >
      <label htmlFor="__hp_email">Email address</label>
      <input
        ref={fieldRef}
        id="__hp_email"
        name="__hp_email"
        type="email"
        tabIndex={-1}
        autoComplete="off"
        placeholder="Leave this empty"
      />
    </div>
  );
}
