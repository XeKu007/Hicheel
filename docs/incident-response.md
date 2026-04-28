# Incident Response Plan — StockFlow

## Хариу арга хэмжээний дараалал

### 1. Илрүүлэх (Detection)

**Автомат илрүүлэлт:**
- Vercel dashboard → Functions → Error rate spike
- Upstash Redis → Rate limit hit surge
- Supabase dashboard → DB connection spike
- GitHub Actions → Security workflow failure

**Гараар шалгах:**
```bash
# Audit log-оос сэжигтэй үйлдэл хайх
# /org/audit хуудас → DELETE/ROLE_CHANGE filter

# Rate limit hit-ийг Redis-д шалгах
# Upstash console → Keys → rate_limit:*

# Honeypot hit-ийг шалгах
# Upstash console → Keys → honeypot:hits
```

---

### 2. Тусгаарлах (Containment)

#### A. Нэг IP блоклох
```bash
# Upstash console → CLI
SET honeypot:blocked:<IP> "1" EX 86400
```

#### B. Бүх session-ийг устгах (account takeover үед)
```bash
# Stack Auth dashboard → Users → [user] → Invalidate sessions
```

#### C. Vercel deployment-ийг зогсоох
```bash
# Vercel dashboard → Project → Settings → Pause deployment
# эсвэл
vercel rollback
```

#### D. DB-г read-only болгох (data breach үед)
```
# Supabase dashboard → Settings → Database → Pause project
```

---

### 3. Судлах (Investigation)

**Audit log шалгах:**
- `/org/audit` → actionType: DELETE, ROLE_CHANGE, MEMBERSHIP
- Хугацааны хязгаар тавьж хэн, хэзээ, юу хийснийг харах

**Affected data тодорхойлох:**
```sql
-- Сэжигтэй хугацаанд хийгдсэн бүх үйлдэл
SELECT * FROM "AuditLog"
WHERE "createdAt" > '<incident_start>'
ORDER BY "createdAt" DESC;
```

**Rate limit log шалгах:**
```
# Upstash console → Keys → rate_limit:*
# Хэт олон hit хийсэн IP-уудыг тодорхойлох
```

---

### 4. Арилгах (Eradication)

- Нөлөөлөгдсөн хэрэглэгчийн нууц үгийг reset хийх (Stack Auth dashboard)
- Сэжигтэй member-ийг org-оос хасах (`/org/approvals`)
- Affected product data-г audit log-оос сэргээх
- Redis cache-ийг цэвэрлэх:
  ```
  # Upstash console → Flush DB (зөвхөн шаардлагатай үед)
  ```

---

### 5. Сэргээх (Recovery)

**Vercel:**
```bash
# Өмнөх deployment руу буцах
vercel rollback [deployment-url]
```

**DB backup сэргээх:**
```
# Supabase dashboard → Database → Backups → Restore
```

**Cache дахин дүүргэх:**
- App дахин deploy хийхэд Redis cache автоматаар дүүрнэ
- TTL дуусмагц шинэ data орно

---

### 6. Мэдэгдэл (Notification)

| Нөхцөл | Хэнд мэдэгдэх | Хугацаа |
|--------|--------------|---------|
| Data breach | Нөлөөлөгдсөн хэрэглэгчид | 72 цагийн дотор |
| Service outage | Бүх хэрэглэгчид | 1 цагийн дотор |
| Security patch | Хөгжүүлэгчид | Нэн даруй |

---

### 7. Сургамж (Lessons Learned)

Incident дараа 1 долоо хоногийн дотор:
- Яаж илэрсэн бэ?
- Хариу арга хэмжээ хэр хурдан байсан бэ?
- Ямар хамгаалалт дутуу байсан бэ?
- Дараагийн удаа яаж сэргийлэх вэ?

---

## Холбоо барих

| Үүрэг | Хэрэгсэл |
|-------|---------|
| Vercel | dashboard.vercel.com |
| Supabase | supabase.com/dashboard |
| Stack Auth | app.stack-auth.com |
| Upstash | console.upstash.com |
| Stripe | dashboard.stripe.com |

---

## Хурдан лавлах

```
WAF block log:    Vercel → Functions → Logs → filter "[WAF]"
Honeypot hits:    Upstash → honeypot:hits key
Rate limit:       Upstash → rate_limit:* keys
Audit trail:      /org/audit page
Active sessions:  Stack Auth dashboard → Users
```
