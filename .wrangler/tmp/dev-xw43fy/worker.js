var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-edp9We/checked-fetch.js
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
  const recentKey = `recent:${chatId}`;
  const currentIndex = await getJSON(kv, indexKey, 0);
  const recentQuestions = await getJSON(kv, recentKey, []);
  let safeIndex = currentIndex % questions.length;
  if (questions.length > 5) {
    let attempts = 0;
    while (recentQuestions.includes(safeIndex) && attempts < questions.length) {
      safeIndex = (safeIndex + 1) % questions.length;
      attempts++;
    }
  }
  const question = questions[safeIndex];
  const nextIndex = (safeIndex + 1) % questions.length;
  const updatedRecent = [safeIndex, ...recentQuestions.filter((idx) => idx !== safeIndex)].slice(0, Math.min(5, Math.floor(questions.length / 2)));
  await putJSON(kv, indexKey, nextIndex);
  await putJSON(kv, recentKey, updatedRecent);
  const now = /* @__PURE__ */ new Date();
  const indianTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(now);
  const questionId = `${safeIndex}_${Date.now()}`;
  const text = `\u{1F9E0} Hourly MCQ #${safeIndex + 1}

${esc(question.question)}

A) ${esc(question.options.A)}
B) ${esc(question.options.B)}
C) ${esc(question.options.C)}
D) ${esc(question.options.D)}

\u23F0 Posted: ${indianTime} IST`;
  const keyboard = {
    inline_keyboard: [[
      { text: "A", callback_data: `ans:${questionId}:A` },
      { text: "B", callback_data: `ans:${questionId}:B` },
      { text: "C", callback_data: `ans:${questionId}:C` },
      { text: "D", callback_data: `ans:${questionId}:D` }
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
async function uploadQuestionsFromText(kv, content, targetGroupId) {
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
__name(uploadQuestionsFromText, "uploadQuestionsFromText");
async function uploadQuestionsFromFile(kv, token, fileId, targetGroupId) {
  const fileInfo = await getFile(token, fileId);
  if (!fileInfo.ok) {
    throw new Error("Failed to get file info");
  }
  const content = await downloadFile(token, fileInfo.result.file_path);
  return await uploadQuestionsFromText(kv, content, targetGroupId);
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
async function formatQuestionsList(kv, page = 0, pageSize = 5) {
  const questions = await getJSON(kv, "questions", []);
  if (questions.length === 0) {
    return { text: "\u{1F4DD} No questions in database yet.", hasMore: false, totalPages: 0 };
  }
  const totalPages = Math.ceil(questions.length / pageSize);
  const startIdx = page * pageSize;
  const endIdx = Math.min(startIdx + pageSize, questions.length);
  const pageQuestions = questions.slice(startIdx, endIdx);
  let text = `\u{1F4DA} Questions Database (Page ${page + 1}/${totalPages})
`;
  text += `Total: ${questions.length} questions

`;
  for (let i = 0; i < pageQuestions.length; i++) {
    const globalIdx = startIdx + i;
    const q = pageQuestions[i];
    const shortQuestion = q.question.length > 60 ? q.question.substring(0, 60) + "..." : q.question;
    text += `${globalIdx + 1}. ${shortQuestion}
`;
    text += `   Answer: ${q.answer}) ${q.options[q.answer]}

`;
  }
  return {
    text,
    hasMore: endIdx < questions.length,
    totalPages
  };
}
__name(formatQuestionsList, "formatQuestionsList");
async function deleteQuestion(kv, questionIndex, targetGroupId) {
  const questions = await getJSON(kv, "questions", []);
  if (questionIndex < 0 || questionIndex >= questions.length) {
    return { success: false, message: "Invalid question index" };
  }
  const deletedQuestion = questions[questionIndex];
  questions.splice(questionIndex, 1);
  await putJSON(kv, "questions", questions);
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON(kv, indexKey, 0);
  if (currentIndex > questions.length) {
    await putJSON(kv, indexKey, questions.length > 0 ? 0 : 0);
  }
  const recentKey = `recent:${targetGroupId}`;
  await putJSON(kv, recentKey, []);
  const shortQuestion = deletedQuestion.question.length > 50 ? deletedQuestion.question.substring(0, 50) + "..." : deletedQuestion.question;
  return {
    success: true,
    message: `\u2705 Deleted question #${questionIndex + 1}: "${shortQuestion}"

\u{1F4CA} ${questions.length} questions remaining in database.`
  };
}
__name(deleteQuestion, "deleteQuestion");
async function sendToGroup(token, groupId, message) {
  if (message.text) {
    await sendMessage(token, groupId, `\u{1F4E2} Admin Message:

${message.text}`);
  } else if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
    const body = {
      chat_id: groupId,
      photo: photo.file_id,
      caption: message.text ? `\u{1F4E2} Admin: ${message.text}` : "\u{1F4E2} Photo from admin"
    };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } else if (message.document) {
    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    const body = {
      chat_id: groupId,
      document: message.document.file_id,
      caption: message.text ? `\u{1F4E2} Admin: ${message.text}` : "\u{1F4E2} Document from admin"
    };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }
}
__name(sendToGroup, "sendToGroup");
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
              await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
              const keyboard = {
                inline_keyboard: [
                  [{ text: "\u{1F4E4} Upload Questions", callback_data: "admin:upload" }],
                  [{ text: "\u{1F4DA} Manage Questions", callback_data: "admin:manage" }],
                  [{ text: "\u{1F4E2} Send to Group", callback_data: "admin:send" }],
                  [{ text: "\u{1F4CA} Daily Report", callback_data: "admin:daily" }],
                  [{ text: "\u{1F4C8} Monthly Report", callback_data: "admin:monthly" }]
                ]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u{1F916} Admin Panel\n\nChoose an action:", { reply_markup: keyboard });
            } else if (message.document) {
              const adminState = await getJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
              if (adminState.mode === "sending_to_group") {
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u2705 Document sent to group successfully!");
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\u274C Error sending document to group: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
              } else {
                try {
                  console.log("Processing file upload from admin:", chatId);
                  const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                  const responseMessage = `\u2705 Successfully uploaded ${result.uploaded} questions!

\u{1F4CA} Database Status:
\u2022 Total questions in database: ${result.total}
\u2022 Questions already sent: ${result.sent}
\u2022 Questions remaining unsent: ${result.unsent}

\u{1F4A1} Tip: You can also send JSON text directly (no file needed)!`;
                  console.log("Sending response to admin:", responseMessage);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                } catch (error) {
                  console.error("File upload error:", error);
                  const errorMessage = `\u274C Error uploading questions: ${error instanceof Error ? error.message : "Unknown error"}`;
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
                }
              }
            } else if (message.text && message.text !== "/start") {
              const adminState = await getJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
              if (adminState.mode === "sending_to_group") {
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u2705 Message sent to group successfully!");
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\u274C Error sending to group: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
              } else if (adminState.mode === "deleting_question") {
                const questionNum = parseInt(message.text.trim());
                if (isNaN(questionNum) || questionNum < 1) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u274C Please enter a valid question number (e.g., 1, 2, 3...)");
                  return new Response("OK");
                }
                const result = await deleteQuestion(env.STATE, questionNum - 1, env.TARGET_GROUP_ID);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.message);
                await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
              } else {
                try {
                  console.log("Processing JSON text from admin:", chatId);
                  const result = await uploadQuestionsFromText(env.STATE, message.text, env.TARGET_GROUP_ID);
                  const responseMessage = `\u2705 Successfully uploaded ${result.uploaded} questions from text!

\u{1F4CA} Database Status:
\u2022 Total questions in database: ${result.total}
\u2022 Questions already sent: ${result.sent}
\u2022 Questions remaining unsent: ${result.unsent}

\u{1F504} Next question will be #${result.sent + 1}`;
                  console.log("Sending response to admin:", responseMessage);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                } catch (error) {
                  console.error("JSON text upload error:", error);
                  const errorMessage = `\u274C Error uploading questions from text: ${error instanceof Error ? error.message : "Unknown error"}

\u{1F4A1} Make sure to send valid JSON format:
[{"question":"...", "options":{"A":"...", "B":"...", "C":"...", "D":"..."}, "answer":"A", "explanation":"..."}]`;
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
                }
              }
            } else if (message.photo) {
              const adminState = await getJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
              if (adminState.mode === "sending_to_group") {
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u2705 Photo sent to group successfully!");
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\u274C Error sending photo to group: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '\u{1F4F7} To send photos to the group, use the "Send to Group" feature from the admin panel.');
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
            const qid = parseInt(qidStr.split("_")[0]);
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
              const correctAnswer = `

\u{1F3AF} Correct Answer: ${question.answer}) ${question.options[question.answer]}`;
              const popup = `${resultText}${correctAnswer}

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
              '\u{1F4E4} Upload Questions\n\nYou can upload questions in two ways:\n\n1\uFE0F\u20E3 **JSON File**: Send a .json file\n2\uFE0F\u20E3 **JSON Text**: Send JSON directly as a message\n\nFormat: Array of objects or JSONL (one object per line)\n\nExample:\n[{"question":"What is 2+2?", "options":{"A":"3", "B":"4", "C":"5", "D":"6"}, "answer":"B", "explanation":"2+2=4"}]'
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
          } else if (data === "admin:manage") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questionsList = await formatQuestionsList(env.STATE, 0);
            const keyboard = {
              inline_keyboard: [
                [{ text: "\u{1F440} View Questions", callback_data: "admin:view:0" }],
                [{ text: "\u{1F5D1}\uFE0F Delete Question", callback_data: "admin:delete_mode" }],
                [{ text: "\u{1F519} Back to Main", callback_data: "admin:main" }]
              ]
            };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `\u{1F4DA} Question Management

${questionsList.text}`, { reply_markup: keyboard });
          } else if (data === "admin:send") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "sending_to_group" });
            const keyboard = {
              inline_keyboard: [
                [{ text: "\u274C Cancel", callback_data: "admin:main" }]
              ]
            };
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              chatId,
              "\u{1F4E2} Send to Group Mode\n\nSend any message (text, photo, or document) and it will be forwarded to the group.\n\nWhat would you like to send?",
              { reply_markup: keyboard }
            );
          } else if (data.startsWith("admin:view:")) {
            const page = parseInt(data.split(":")[2]) || 0;
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questionsList = await formatQuestionsList(env.STATE, page);
            const keyboard = {
              inline_keyboard: []
            };
            const navRow = [];
            if (page > 0) {
              navRow.push({ text: "\u2B05\uFE0F Previous", callback_data: `admin:view:${page - 1}` });
            }
            if (questionsList.hasMore) {
              navRow.push({ text: "Next \u27A1\uFE0F", callback_data: `admin:view:${page + 1}` });
            }
            if (navRow.length > 0) {
              keyboard.inline_keyboard.push(navRow);
            }
            keyboard.inline_keyboard.push([{ text: "\u{1F519} Back to Management", callback_data: "admin:manage" }]);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, questionsList.text, { reply_markup: keyboard });
          } else if (data === "admin:delete_mode") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "deleting_question" });
            const keyboard = {
              inline_keyboard: [
                [{ text: "\u274C Cancel", callback_data: "admin:manage" }]
              ]
            };
            await sendMessage(
              env.TELEGRAM_BOT_TOKEN,
              chatId,
              "\u{1F5D1}\uFE0F Delete Question\n\nEnter the question number you want to delete (e.g., 1, 2, 3...)\n\n\u26A0\uFE0F This action cannot be undone!",
              { reply_markup: keyboard }
            );
          } else if (data === "admin:main") {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: "normal" });
            const keyboard = {
              inline_keyboard: [
                [{ text: "\u{1F4E4} Upload Questions", callback_data: "admin:upload" }],
                [{ text: "\u{1F4DA} Manage Questions", callback_data: "admin:manage" }],
                [{ text: "\u{1F4E2} Send to Group", callback_data: "admin:send" }],
                [{ text: "\u{1F4CA} Daily Report", callback_data: "admin:daily" }],
                [{ text: "\u{1F4C8} Monthly Report", callback_data: "admin:monthly" }]
              ]
            };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, "\u{1F916} Admin Panel\n\nChoose an action:", { reply_markup: keyboard });
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

// .wrangler/tmp/bundle-edp9We/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-edp9We/middleware-loader.entry.ts
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
