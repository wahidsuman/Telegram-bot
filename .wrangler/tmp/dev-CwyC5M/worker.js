var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-ThV05R/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// src/worker.ts
function esc(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
__name(esc, "esc");
async function getJSON(kv, key, defaultValue) {
  try {
    const value = await kv.get(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch {
    return defaultValue;
  }
}
__name(getJSON, "getJSON");
async function putJSON(kv, key, obj) {
  await kv.put(key, JSON.stringify(obj));
}
__name(putJSON, "putJSON");
function getCurrentDate(tz) {
  const now = /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
}
__name(getCurrentDate, "getCurrentDate");
function getCurrentMonth(tz) {
  const now = /* @__PURE__ */ new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit"
  });
  return formatter.format(now);
}
__name(getCurrentMonth, "getCurrentMonth");
async function sendMessage(token, chatId, text, options) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...options
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}
__name(sendMessage, "sendMessage");
async function answerCallbackQuery(token, queryId, text, showAlert) {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const body = {
    callback_query_id: queryId,
    text,
    show_alert: showAlert || false
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}
__name(answerCallbackQuery, "answerCallbackQuery");
async function getFile(token, fileId) {
  const url = `https://api.telegram.org/bot${token}/getFile`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId })
  });
  return response.json();
}
__name(getFile, "getFile");
async function downloadFile(token, filePath) {
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await fetch(url);
  return response.text();
}
__name(downloadFile, "downloadFile");
async function ensureKeys(kv) {
  const questions = await getJSON(kv, "questions", []);
  if (questions.length === 0) {
    await putJSON(kv, "questions", []);
  }
}
__name(ensureKeys, "ensureKeys");
async function initializeBotIfNeeded(kv, token, targetGroupId) {
  const questions = await getJSON(kv, "questions", []);
  if (questions.length === 0) {
    const sampleQuestion = {
      question: "Welcome to Prepladder MCQ Bot! Which programming paradigm focuses on functions as first-class citizens?",
      options: {
        A: "Object-Oriented Programming",
        B: "Functional Programming",
        C: "Procedural Programming",
        D: "Declarative Programming"
      },
      answer: "B",
      explanation: "Functional programming treats functions as first-class citizens, allowing them to be assigned to variables, passed as arguments, and returned from other functions."
    };
    await putJSON(kv, "questions", [sampleQuestion]);
  }
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON(kv, indexKey, -1);
  if (currentIndex === -1) {
    await putJSON(kv, indexKey, 0);
    try {
      await postNext(kv, token, targetGroupId);
    } catch (error) {
      console.log("Error posting initial question:", error);
    }
  }
}
__name(initializeBotIfNeeded, "initializeBotIfNeeded");
async function incrementStats(kv, userId, isCorrect, tz) {
  const userIdStr = userId.toString();
  const today = getCurrentDate(tz);
  const month = getCurrentMonth(tz);
  const dailyKey = `stats:daily:${today}`;
  const dailyStats = await getJSON(kv, dailyKey, { total: 0, users: {} });
  dailyStats.total += 1;
  if (!dailyStats.users[userIdStr]) {
    dailyStats.users[userIdStr] = { cnt: 0, correct: 0 };
  }
  dailyStats.users[userIdStr].cnt += 1;
  if (isCorrect) {
    dailyStats.users[userIdStr].correct += 1;
  }
  await putJSON(kv, dailyKey, dailyStats);
  const monthlyKey = `stats:monthly:${month}`;
  const monthlyStats = await getJSON(kv, monthlyKey, { total: 0, users: {} });
  monthlyStats.total += 1;
  if (!monthlyStats.users[userIdStr]) {
    monthlyStats.users[userIdStr] = { cnt: 0, correct: 0 };
  }
  monthlyStats.users[userIdStr].cnt += 1;
  if (isCorrect) {
    monthlyStats.users[userIdStr].correct += 1;
  }
  await putJSON(kv, monthlyKey, monthlyStats);
}
__name(incrementStats, "incrementStats");
async function postNext(kv, token, chatId) {
  const questions = await getJSON(kv, "questions", []);
  if (questions.length === 0) {
    console.log("No questions available");
    return;
  }
  const indexKey = `idx:${chatId}`;
  const currentIndex = await getJSON(kv, indexKey, 0);
  const question = questions[currentIndex];
  const nextIndex = (currentIndex + 1) % questions.length;
  await putJSON(kv, indexKey, nextIndex);
  const text = `\u{1F9E0} Hourly MCQ #${currentIndex + 1}

${esc(question.question)}

A) ${esc(question.options.A)}
B) ${esc(question.options.B)}
C) ${esc(question.options.C)}
D) ${esc(question.options.D)}`;
  const keyboard = {
    inline_keyboard: [[
      { text: "A", callback_data: `ans:${currentIndex}:A` },
      { text: "B", callback_data: `ans:${currentIndex}:B` },
      { text: "C", callback_data: `ans:${currentIndex}:C` },
      { text: "D", callback_data: `ans:${currentIndex}:D` }
    ]]
  };
  await sendMessage(token, chatId, text, { reply_markup: keyboard });
}
__name(postNext, "postNext");
function validateQuestion(q) {
  return typeof q === "object" && typeof q.question === "string" && typeof q.options === "object" && typeof q.options.A === "string" && typeof q.options.B === "string" && typeof q.options.C === "string" && typeof q.options.D === "string" && typeof q.answer === "string" && ["A", "B", "C", "D"].includes(q.answer) && typeof q.explanation === "string";
}
__name(validateQuestion, "validateQuestion");
function trimQuestion(q) {
  return {
    question: q.question.trim(),
    options: {
      A: q.options.A.trim(),
      B: q.options.B.trim(),
      C: q.options.C.trim(),
      D: q.options.D.trim()
    },
    answer: q.answer,
    explanation: q.explanation.trim()
  };
}
__name(trimQuestion, "trimQuestion");
async function uploadQuestionsFromFile(kv, token, fileId, targetGroupId) {
  const fileInfo = await getFile(token, fileId);
  if (!fileInfo.ok) {
    throw new Error("Failed to get file info");
  }
  const content = await downloadFile(token, fileInfo.result.file_path);
  let newQuestions = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      newQuestions = parsed;
    } else {
      newQuestions = [parsed];
    }
  } catch {
    const lines = content.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      try {
        const q = JSON.parse(line);
        newQuestions.push(q);
      } catch {
        throw new Error("Invalid JSON format");
      }
    }
  }
  const validQuestions = [];
  for (const q of newQuestions) {
    if (validateQuestion(q)) {
      validQuestions.push(trimQuestion(q));
    }
  }
  if (validQuestions.length === 0) {
    throw new Error("No valid questions found");
  }
  const existingQuestions = await getJSON(kv, "questions", []);
  const allQuestions = [...existingQuestions, ...validQuestions];
  await putJSON(kv, "questions", allQuestions);
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON(kv, indexKey, 0);
  return {
    uploaded: validQuestions.length,
    total: allQuestions.length,
    sent: currentIndex,
    unsent: Math.max(0, allQuestions.length - currentIndex)
  };
}
__name(uploadQuestionsFromFile, "uploadQuestionsFromFile");
async function formatDailyReport(kv, date) {
  const stats = await getJSON(kv, `stats:daily:${date}`, { total: 0, users: {} });
  const uniqueUsers = Object.keys(stats.users).length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : "0";
  let report = `\u{1F4CA} Daily MCQ Report - ${date}

`;
  report += `\u{1F465} Unique Users: ${uniqueUsers}
`;
  report += `\u{1F4DD} Total Answers: ${totalAnswers}
`;
  report += `\u{1F4C8} Average per User: ${avgPerUser}

`;
  if (uniqueUsers > 0) {
    const topUsers = Object.entries(stats.users).sort(([, a], [, b]) => b.cnt - a.cnt).slice(0, 5);
    report += `Top Users Today:
`;
    for (const [userId, userStats] of topUsers) {
      const accuracy = userStats.cnt > 0 ? (userStats.correct / userStats.cnt * 100).toFixed(0) : "0";
      report += `\u2022 User ${userId}: ${userStats.cnt} questions, ${accuracy}% accuracy
`;
    }
  }
  return report;
}
__name(formatDailyReport, "formatDailyReport");
async function formatMonthlyReport(kv, yyyyMM) {
  const stats = await getJSON(kv, `stats:monthly:${yyyyMM}`, { total: 0, users: {} });
  const uniqueUsers = Object.keys(stats.users).length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : "0";
  let report = `\u{1F4CA} Monthly MCQ Report - ${yyyyMM}

`;
  report += `\u{1F465} Unique Users: ${uniqueUsers}
`;
  report += `\u{1F4DD} Total Answers: ${totalAnswers}
`;
  report += `\u{1F4C8} Average per User: ${avgPerUser}

`;
  if (uniqueUsers > 0) {
    const topUsers = Object.entries(stats.users).sort(([, a], [, b]) => b.cnt - a.cnt).slice(0, 5);
    report += `Top Users This Month:
`;
    for (const [userId, userStats] of topUsers) {
      const accuracy = userStats.cnt > 0 ? (userStats.correct / userStats.cnt * 100).toFixed(0) : "0";
      report += `\u2022 User ${userId}: ${userStats.cnt} questions, ${accuracy}% accuracy
`;
    }
  }
  return report;
}
__name(formatMonthlyReport, "formatMonthlyReport");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/webhook" && request.method === "POST") {
        const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secretHeader !== env.WEBHOOK_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const update = await request.json();
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        if (update.message) {
          const message = update.message;
          const chatId = message.chat.id;
          const userId = message.from?.id;
          if (chatId.toString() === env.ADMIN_CHAT_ID) {
            if (message.text === "/start") {
              const keyboard = {
                inline_keyboard: [
                  [{ text: "\u{1F4E4} Upload Questions", callback_data: "admin:upload" }],
                  [{ text: "\u{1F4CA} Daily Report", callback_data: "admin:daily" }],
                  [{ text: "\u{1F4C8} Monthly Report", callback_data: "admin:monthly" }]
                ]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "Admin Panel", { reply_markup: keyboard });
            } else if (message.document) {
              try {
                console.log("Processing file upload from admin:", chatId);
                const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                const responseMessage = `\u2705 Successfully uploaded ${result.uploaded} questions!

\u{1F4CA} Database Status:
\u2022 Total questions in database: ${result.total}
\u2022 Questions already sent: ${result.sent}
\u2022 Questions remaining unsent: ${result.unsent}`;
                console.log("Sending response to admin:", responseMessage);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
              } catch (error) {
                console.error("File upload error:", error);
                const errorMessage = `\u274C Error uploading questions: ${error instanceof Error ? error.message : "Unknown error"}`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
              }
            }
          } else if (message.chat.type === "private") {
            const keyboard = {
              inline_keyboard: [
                [{ text: "Get Code", callback_data: "coupon:copy" }],
                [{ text: "Bargain", callback_data: "coupon:bargain" }]
              ]
            };
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              chatId,
              "Here For Best Prepladder Discount Coupon? Click Below -",
              { reply_markup: keyboard }
            );
          }
        } else if (update.callback_query) {
          const query = update.callback_query;
          const data = query.data || "";
          const userId = query.from.id;
          const chatId = query.message?.chat.id;
          if (data.startsWith("ans:")) {
            const [, qidStr, answer] = data.split(":");
            const qid = parseInt(qidStr);
            const questions = await getJSON(env.STATE, "questions", []);
            if (qid >= 0 && qid < questions.length) {
              const question = questions[qid];
              const isCorrect = answer === question.answer;
              await incrementStats(env.STATE, userId, isCorrect, env.TZ || "Asia/Kolkata");
              let explanation = question.explanation;
              if (explanation.length > 120) {
                explanation = explanation.substring(0, 120) + "...";
              }
              const resultText = isCorrect ? "\u2705 Correct!" : "\u274C Wrong!";
              const popup = `${resultText}

${explanation}

(to know more prepladder Discounts text me)`;
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, popup, true);
            } else {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, "\u274C Question not found", true);
            }
          } else if (data === "coupon:copy") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, "P650 coupon code copied");
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "P650");
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              chatId,
              "Thank you for Purchasing With Our Code P650. If You want more discount, you can always click on the bargain button"
            );
            const userName = `${query.from.first_name}${query.from.last_name ? " " + query.from.last_name : ""}`;
            const username = query.from.username ? `@${query.from.username}` : "\u2014";
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              env.ADMIN_CHAT_ID,
              `\u{1F4B0} Code Used: P650

User: ${userName}
Username: ${username}
User ID: ${userId}

User has copied the discount code!`
            );
          } else if (data === "coupon:bargain") {
            await answerCallbackQuery(
              env.TELEGRAM_BOT_TOKEN,
              query.id,
              "Stay Still Admin Will reply shortly, be ready with your bargaining skills\u2026\u{1F606}\u{1F606}\u{1F606}",
              true
            );
            const userName = `${query.from.first_name}${query.from.last_name ? " " + query.from.last_name : ""}`;
            const username = query.from.username ? `@${query.from.username}` : "\u2014";
            const bargainMsg = `\u{1F91D} Bargain Request

User: ${userName}
Username: ${username}
User ID: ${userId}

Ready to negotiate discount!`;
            await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, bargainMsg);
          } else if (data === "admin:upload") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              chatId,
              "Please send a JSON file with questions. Format should be an array of objects or JSONL (one object per line)."
            );
          } else if (data === "admin:daily") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const today = getCurrentDate(env.TZ || "Asia/Kolkata");
            const report = await formatDailyReport(env.STATE, today);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, report);
          } else if (data === "admin:monthly") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const month = getCurrentMonth(env.TZ || "Asia/Kolkata");
            const report = await formatMonthlyReport(env.STATE, month);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, report);
          }
        }
        return new Response("OK");
      } else if (url.pathname === "/tick" && request.method === "GET") {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        await postNext(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        return new Response("MCQ posted");
      } else if (url.pathname === "/start-posting" && request.method === "GET") {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        return new Response("Bot initialized and first MCQ posted");
      } else if (url.pathname === "/health" && request.method === "GET") {
        return new Response("ok");
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error("Error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
  async scheduled(event, env) {
    try {
      await ensureKeys(env.STATE);
      await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
      await postNext(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
    } catch (error) {
      console.error("Scheduled error:", error);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-ThV05R/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-ThV05R/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
