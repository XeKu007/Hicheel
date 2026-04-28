import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getOrgContext } from "@/lib/org";
import { getAIModel } from "@/lib/ai/provider";
import { getOrCreateSession, getRecentMessages, persistMessages } from "@/lib/actions/ai/chat";
import { checkOrgRateLimit } from "@/lib/ai/chat-rate-limit";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { writeAuditLog } from "@/lib/actions/audit";
import { z } from "zod";

// Strict request body schema — prevents unbounded input reaching the AI or DB
const ChatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  // sessionId can be UUID (v4) or CUID — accept any non-empty string up to 64 chars
  sessionId: z.string().min(1).max(64).nullish().transform(v => v ?? undefined),
});

const SYSTEM_PROMPT = `You are StockFlow AI, an inventory management assistant. Respond in the same language as the user (English or Mongolian).

IMPORTANT: When you need to perform a database action, you MUST output ONLY a valid JSON object on the FIRST line of your response, followed by a newline, then your explanation text.

JSON format for actions:
- Create product: {"action":"createProduct","name":"NAME","quantity":0,"price":0}
- Update product: {"action":"updateProduct","name":"NAME","newName":"NEWNAME","quantity":10,"price":5.99}
- Delete product: {"action":"deleteProduct","name":"NAME"}
- Get summary: {"action":"getInventorySummary"}
- Count products: {"action":"countProducts","nameFilter":"FILTER"}
- Find product: {"action":"getProductByName","name":"NAME"}
- List low stock: {"action":"listLowStockProducts"}
- List top value: {"action":"listTopValueProducts","limit":10}

Rules:
- For updateProduct, only include fields you want to change (newName, quantity, price are all optional)
- For createProduct, use 0 for missing quantity or price
- Always put the JSON on the FIRST line, explanation on the next lines
- If no action needed, just respond with plain text

Example:
User: "add apple with quantity 50"
Response:
{"action":"createProduct","name":"apple","quantity":50,"price":0}
Apple бараа 50 ширхэгтэйгээр амжилттай нэмэгдлээ.`;

async function executeAction(
  action: Record<string, unknown>,
  organizationId: string,
  memberId: string,
  role: string
): Promise<string> {
  // Explicit role check — avoids dynamic key access on ROLE_HIERARCHY
  const roleLevel = role === "SUPER_ADMIN" ? 2 : role === "MANAGER" ? 1 : 0;
  const isManager = roleLevel >= 1;

  switch (action.type) {
    case "createProduct": {
      if (!isManager) return "Error: MANAGER or SUPER_ADMIN role required.";
      const created = await prisma.product.create({
        data: {
          name: String(action.name),
          quantity: Math.round(Number(action.quantity ?? 0)),
          price: Number(action.price ?? 0),
          organizationId,
        },
        select: { id: true, name: true, quantity: true, price: true },
      });
      void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "CREATE", entityType: "Product", entityId: created.id, entityName: created.name, before: null, after: { name: created.name, quantity: created.quantity, price: Number(created.price) } }).catch(() => {});
      await invalidateCache([`org:${organizationId}:dashboard`, `org:${organizationId}:inventory:*`]);
      return JSON.stringify({ success: true, product: { id: created.id, name: created.name, quantity: created.quantity, price: Number(created.price) } });
    }
    case "updateProduct": {
      if (!isManager) return JSON.stringify({ error: "MANAGER or SUPER_ADMIN role required." });
      const existing = await prisma.product.findFirst({ where: { organizationId, name: { equals: String(action.name), mode: "insensitive" } }, select: { id: true, name: true, quantity: true, price: true } });
      if (!existing) return JSON.stringify({ error: `Product "${action.name}" not found.` });
      // Build update data with explicit fields — no dynamic key access
      const updateData: { name?: string; quantity?: number; price?: number } = {};
      if (action.newName) updateData.name = String(action.newName);
      if (action.quantity !== undefined) updateData.quantity = Math.round(Number(action.quantity));
      if (action.price !== undefined) updateData.price = Number(action.price);
      const updated = await prisma.product.update({ where: { id: existing.id }, data: updateData, select: { id: true, name: true, quantity: true, price: true } });
      void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "UPDATE", entityType: "Product", entityId: existing.id, entityName: updated.name, before: { name: existing.name, quantity: existing.quantity, price: Number(existing.price) }, after: { name: updated.name, quantity: updated.quantity, price: Number(updated.price) } }).catch(() => {});
      await invalidateCache([`org:${organizationId}:dashboard`, `org:${organizationId}:inventory:*`]);
      return JSON.stringify({ success: true, product: { id: updated.id, name: updated.name, quantity: updated.quantity, price: Number(updated.price) } });
    }
    case "listLowStockProducts": {
      const products = await prisma.product.findMany({ where: { organizationId, lowStockAt: { not: null } }, select: { id: true, name: true, quantity: true, lowStockAt: true } });
      const filtered = products.filter(p => p.quantity <= (p.lowStockAt ?? 0));
      return JSON.stringify({ products: filtered, count: filtered.length });
    }
    case "listTopValueProducts": {
      const products = await prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, quantity: true, price: true } });
      const sorted = products
        .map(p => ({ ...p, price: Number(p.price), totalValue: Number(p.price) * p.quantity }))
        .sort((a, b) => b.totalValue - a.totalValue)
        .slice(0, Number(action.limit ?? 10));
      return JSON.stringify({ products: sorted });
    }
    case "deleteProduct": {
      if (!isManager) return JSON.stringify({ error: "MANAGER or SUPER_ADMIN role required." });
      const existing = await prisma.product.findFirst({ where: { organizationId, name: { equals: String(action.name), mode: "insensitive" } } });
      if (!existing) return JSON.stringify({ error: `Product "${action.name}" not found.` });
      await prisma.product.delete({ where: { id: existing.id } });
      void writeAuditLog({ organizationId, actorMemberId: memberId, actorDisplayName: "", actionType: "DELETE", entityType: "Product", entityId: existing.id, entityName: existing.name, before: { name: existing.name, quantity: existing.quantity, price: Number(existing.price) }, after: null }).catch(() => {});
      await invalidateCache([`org:${organizationId}:dashboard`, `org:${organizationId}:inventory:*`]);
      return JSON.stringify({ success: true, deletedName: existing.name });
    }
    case "getInventorySummary": {
      const products = await prisma.product.findMany({ where: { organizationId }, select: { price: true, quantity: true, lowStockAt: true } });
      const totalValue = products.reduce((s, p) => s + Number(p.price) * p.quantity, 0);
      const lowStockCount = products.filter(p => p.lowStockAt !== null && p.quantity <= p.lowStockAt).length;
      const outOfStockCount = products.filter(p => p.quantity === 0).length;
      return JSON.stringify({ totalSKUs: products.length, totalValue, lowStockCount, outOfStockCount });
    }
    case "countProducts": {
      const count = await prisma.product.count({ where: { organizationId, ...(action.nameFilter ? { name: { contains: String(action.nameFilter), mode: "insensitive" } } : {}) } });
      return JSON.stringify({ count });
    }
    case "getProductByName": {
      const product = await prisma.product.findFirst({ where: { organizationId, name: { contains: String(action.name), mode: "insensitive" } }, select: { id: true, name: true, sku: true, quantity: true, price: true, lowStockAt: true } });
      if (!product) return JSON.stringify({ found: false });
      return JSON.stringify({ found: true, product: { ...product, price: Number(product.price) } });
    }
    default:
      return "Unknown action type.";
  }
}

// Typed interfaces for formatResult — avoids dynamic key access (security/detect-object-injection)
interface ProductResult { id?: string; name: string; quantity: number; price: number }
interface ActionResult {
  success?: boolean;
  error?: string;
  deletedName?: string;
  product?: ProductResult;
  count?: number;
  totalSKUs?: number;
  totalValue?: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  found?: boolean;
  products?: { name: string; quantity: number }[];
}

function formatResult(resultData: ActionResult, raw: string, userMsg: string): string {
  const isMn = /[а-яөүё]/i.test(userMsg);
  if (resultData.success) {
    if (resultData.deletedName) return isMn ? `✅ "${resultData.deletedName}" бараа устгагдлаа.` : `✅ Product "${resultData.deletedName}" deleted.`;
    if (resultData.product) {
      const p = resultData.product;
      return isMn ? `✅ "${p.name}" бараа амжилттай хадгалагдлаа. Тоо: ${p.quantity}, Үнэ: ${p.price}` : `✅ Product "${p.name}" saved. Qty: ${p.quantity}, Price: ${p.price}`;
    }
    return isMn ? "✅ Амжилттай." : "✅ Done.";
  }
  if (resultData.error) return `❌ ${resultData.error}`;
  if (resultData.count !== undefined) return isMn ? `Нийт ${resultData.count} бараа байна.` : `Total: ${resultData.count} products.`;
  if (resultData.totalSKUs !== undefined) return isMn
    ? `📦 Нийт SKU: ${resultData.totalSKUs}\n💰 Нийт үнэ: ${Number(resultData.totalValue).toFixed(2)}\n⚠️ Бага үлдэгдэл: ${resultData.lowStockCount}\n❌ Дууссан: ${resultData.outOfStockCount}`
    : `📦 Total SKUs: ${resultData.totalSKUs}\n💰 Total Value: ${Number(resultData.totalValue).toFixed(2)}\n⚠️ Low Stock: ${resultData.lowStockCount}\n❌ Out of Stock: ${resultData.outOfStockCount}`;
  if (resultData.found === false) return isMn ? "Бараа олдсонгүй." : "Product not found.";
  if (resultData.found === true && resultData.product) {
    const p = resultData.product;
    return isMn ? `📦 ${p.name}\nТоо: ${p.quantity}\nҮнэ: ${Number(p.price).toFixed(2)}` : `📦 ${p.name}\nQty: ${p.quantity}\nPrice: ${Number(p.price).toFixed(2)}`;
  }
  if (resultData.products && resultData.products.length > 0) {
    return resultData.products.map(p => `• ${p.name}: ${isMn ? "тоо" : "qty"}=${p.quantity}`).join("\n");
  }
  if (resultData.products && resultData.products.length === 0) return isMn ? "Бараа олдсонгүй." : "No products found.";
  return raw;
}
function extractQtyAndPrice(fragment: string): { qty: number; price: number; namePart: string } {
  let qty = 0;
  let price = 0;
  let namePart = fragment.trim();

  // "тоо <N> үнэ <P>" — NOTE: \b doesn't work with Cyrillic, use \s or start/end anchors
  // Match: тоо followed by number, then үнэ followed by number
  const tooUne = namePart.match(/(?:^|\s)тоо\s+(\d+(?:\.\d+)?)\s+үнэ\s+(\d+(?:\.\d+)?)(?:\s|$)/i);
  if (tooUne) {
    qty = parseFloat(tooUne[1]);
    price = parseFloat(tooUne[2]);
    namePart = namePart.replace(tooUne[0].trim(), "").trim();
    return { qty, price, namePart };
  }

  // "тоо <N>" alone
  const tooOnly = namePart.match(/(?:^|\s)тоо\s+(\d+(?:\.\d+)?)(?:\s|$)/i);
  if (tooOnly) {
    qty = parseFloat(tooOnly[1]);
    namePart = namePart.replace(tooOnly[0].trim(), "").trim();
  }

  // "үнэ <P>"
  const uneOnly = namePart.match(/(?:^|\s)үнэ\s+(\d+(?:\.\d+)?)(?:\s|$)/i);
  if (uneOnly) {
    price = parseFloat(uneOnly[1]);
    namePart = namePart.replace(uneOnly[0].trim(), "").trim();
  }

  // "ширхэг <N>" or "<N> ширхэг"
  if (qty === 0) {
    const shirheg = namePart.match(/(\d+(?:\.\d+)?)\s*ширхэг|ширхэг\s*(\d+(?:\.\d+)?)/i);
    if (shirheg) {
      qty = parseFloat(shirheg[1] ?? shirheg[2]);
      namePart = namePart.replace(shirheg[0], "").trim();
    }
  }

  // Trailing number as qty if still 0
  if (qty === 0) {
    const trailing = namePart.match(/\s+(\d+(?:\.\d+)?)$/);
    if (trailing) {
      qty = parseFloat(trailing[1]);
      namePart = namePart.slice(0, -trailing[0].length).trim();
    }
  }

  // Clean up trailing "бараа" or "product"
  namePart = namePart.replace(/\s*(бараа|product)\s*$/i, "").trim();

  return { qty, price, namePart };
}

function detectFastIntent(msg: string): Record<string, unknown> | null {
  // Limit input length to prevent ReDoS
  const raw = msg.slice(0, 200).toLowerCase().trim();

  // Summary — simple keyword check, no complex regex
  const hasSummary = raw.includes("summary") || raw.includes("нийт") || raw.includes("дүн") ||
    raw.includes("overview") || raw.includes("хэдэн бараа") || raw.includes("хэд байна");
  const hasCreate = raw.includes("нэмж") || raw.includes("нэм") || raw.includes("add") || raw.includes("create");
  if (hasSummary && !hasCreate) {
    return { action: "getInventorySummary", type: "getInventorySummary" };
  }

  // Low stock
  if (raw.includes("low stock") || raw.includes("бага үлдэгдэл") || raw.includes("дуусч байна") || raw.includes("дуусах")) {
    return { action: "listLowStockProducts", type: "listLowStockProducts" };
  }

  // Create product — simple prefix match, no backtracking regex
  const createPrefixes = ["add ", "create ", "нэмж өг ", "үүсгэ "];
  // Only match suffix if it appears as a standalone word at the end (not inside a word)
  const createSuffixPatterns = [" нэмж өг", /\s+нэм$/];
  let createFragment: string | null = null;

  for (const prefix of createPrefixes) {
    if (raw.startsWith(prefix)) {
      createFragment = raw.slice(prefix.length).trim();
      break;
    }
  }
  if (!createFragment) {
    for (const suffix of createSuffixPatterns) {
      if (typeof suffix === "string") {
        const idx = raw.lastIndexOf(suffix);
        if (idx > 0) {
          createFragment = raw.slice(0, idx).replace(/^['"]|['"]$/g, "").trim();
          break;
        }
      } else {
        // RegExp suffix
        const m = raw.match(suffix);
        if (m && m.index !== undefined && m.index > 0) {
          createFragment = raw.slice(0, m.index).replace(/^['"]|['"]$/g, "").trim();
          break;
        }
      }
    }
  }

  // "бараа <name> тоо <qty> үнэ <price>" pattern — Mongolian natural language
  if (!createFragment) {
    const baraaPattern = raw.match(/^бараа\s+(.+)/);
    if (baraaPattern) {
      createFragment = baraaPattern[1].trim();
    }
  }

  if (createFragment && createFragment.length > 0) {
    const { qty, price, namePart } = extractQtyAndPrice(createFragment);
    if (namePart.length > 0 && namePart.length < 50) {
      return { action: "createProduct", type: "createProduct", name: namePart, quantity: qty, price };
    }
  }

  // Delete product — simple prefix/suffix match
  const deletePrefixes = ["delete ", "remove ", "устга ", "хас "];
  const deleteSuffixes = [/\s+устга$/, /\s+хас$/];
  let deleteName: string | null = null;

  for (const prefix of deletePrefixes) {
    if (raw.startsWith(prefix)) {
      deleteName = raw.slice(prefix.length).replace(/\s*(бараа)?\s*$/, "").trim();
      break;
    }
  }
  if (!deleteName) {
    for (const suffix of deleteSuffixes) {
      const m = raw.match(suffix);
      if (m && m.index !== undefined && m.index > 0) {
        deleteName = raw.slice(0, m.index).replace(/^['"]|['"]$/g, "").trim();
        break;
      }
    }
  }
  if (deleteName && deleteName.length > 0 && deleteName.length < 50) {
    return { action: "deleteProduct", type: "deleteProduct", name: deleteName };
  }

  // Find product — simple keyword match
  const findPrefixes = ["find ", "get ", "харуул ", "хайх "];
  const findSuffixes = [/\s+хэдтэй$/, /\s+хэд байна$/];
  const howManyPrefix = "how many ";
  let findName: string | null = null;

  if (raw.startsWith(howManyPrefix)) {
    findName = raw.slice(howManyPrefix.length).trim();
  } else {
    for (const prefix of findPrefixes) {
      if (raw.startsWith(prefix)) {
        findName = raw.slice(prefix.length).trim();
        break;
      }
    }
  }
  if (!findName) {
    for (const suffix of findSuffixes) {
      const m = raw.match(suffix);
      if (m && m.index !== undefined && m.index > 0) {
        findName = raw.slice(0, m.index).replace(/^['"]|['"]$/g, "").trim();
        break;
      }
    }
  }
  if (findName && findName.length > 0 && findName.length < 50 &&
      !findName.includes("summary") && !findName.includes("нийт")) {
    return { action: "getProductByName", type: "getProductByName", name: findName };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getOrgContext();
    const limited = await checkOrgRateLimit(ctx.organizationId);
    if (limited) return limited;

    // Validate request body with strict schema
    let parsedBody: { message: string; sessionId?: string };
    try {
      const raw = await request.json();
      const result = ChatBodySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json({ error: "Invalid request: message required (max 2000 chars)" }, { status: 400 });
      }
      parsedBody = result.data;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { message, sessionId: existingSessionId } = parsedBody;

    // Validate sessionId belongs to this org+member before using it
    // Prevents cross-org session hijacking
    let validatedSessionId: string | undefined;
    if (existingSessionId) {
      const session = await prisma.chatSession.findFirst({
        where: { id: existingSessionId, organizationId: ctx.organizationId, memberId: ctx.memberId },
        select: { id: true },
      });
      validatedSessionId = session?.id;
      // If sessionId was provided but doesn't belong to this user, silently create a new one
    }

    const sessionId = validatedSessionId ?? await getOrCreateSession(ctx.organizationId, ctx.memberId);
    const history = await getRecentMessages(ctx.organizationId, ctx.memberId, sessionId);

    // Fast path: detect simple intents without calling AI
    const fastAction = detectFastIntent(message);
    if (fastAction) {
      try {
        const result = await executeAction(fastAction, ctx.organizationId, ctx.memberId, ctx.role);
        const resultData = JSON.parse(result) as Record<string, unknown>;
        const finalText = formatResult(resultData, result, message);
        await persistMessages(ctx.organizationId, ctx.memberId, sessionId, [
          { role: "user", content: message },
          { role: "assistant", content: finalText },
        ]);
        return NextResponse.json({ text: finalText, sessionId });
      } catch (actionErr) {
        const errMsg = actionErr instanceof Error ? actionErr.message : "Action failed";
        console.error("[AI Chat] Fast action failed:", errMsg);
        return NextResponse.json({ text: `❌ ${errMsg}`, sessionId });
      }
    }

    const messages = [
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    const model = getAIModel();
    const { text } = await generateText({ model, system: SYSTEM_PROMPT, messages });

    // Parse and execute action from first line if it's JSON
    let finalText = text;
    const firstLine = text.split("\n")[0].trim();
    try {
      const action = JSON.parse(firstLine) as Record<string, unknown>;
      if (action.action) {
        const typedAction = { ...action, type: action.action };
        const result = await executeAction(typedAction, ctx.organizationId, ctx.memberId, ctx.role);
        const resultData = JSON.parse(result) as ActionResult;
        const explanation = text.split("\n").slice(1).join("\n").trim();
        const formatted = formatResult(resultData, result, message);
        if (resultData.error) {
          finalText = `❌ ${resultData.error}${explanation ? "\n" + explanation : ""}`;
        } else if (resultData.success) {
          finalText = explanation || formatted;
        } else {
          finalText = explanation ? `${explanation}\n\n${formatted}` : formatted;
        }
      }
    } catch {
      // First line is not JSON — plain text response, keep as is
    }

    await persistMessages(ctx.organizationId, ctx.memberId, sessionId, [
      { role: "user", content: message },
      { role: "assistant", content: finalText },
    ]);

    return NextResponse.json({ text: finalText, sessionId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI Chat] Error:", msg);

    // Surface provider-specific errors to the client in dev
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: "AI service temporarily unavailable. Please try again." }, { status: 500 });
  }
}
