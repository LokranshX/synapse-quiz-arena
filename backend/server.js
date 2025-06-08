require('dotenv').config(); // Загружаем переменные окружения из .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios'); // Для запросов к OpenRouter AI

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000", // Разрешаем фронтенду подключаться
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json()); // Для парсинга JSON-запросов

const PORT = process.env.PORT || 5000;

// ===============================================
// Игровые данные в памяти (для прототипа)
// В реальном приложении это будет БД (MongoDB, PostgreSQL и т.д.)
// ===============================================
const rooms = {}; // { roomId: { hostId, players: { socketId: { name, score } }, currentQuestionIndex, questions: [] } }

// Пример вопросов (для тестирования без AI, если ключ не работает)
// Если вы хотите 50 заглушек, добавьте их сюда вручную.
const FALLBACK_QUESTIONS = [
  {
    question: "Какое самое быстрое животное на Земле?",
    options: ["Гепард", "Сокол-сапсан", "Антилопа", "Страус"],
    correct_answer: "Сокол-сапсан"
  },
  {
    question: "Как называется столица Австралии?",
    options: ["Сидней", "Мельбурн", "Канберра", "Перт"],
    correct_answer: "Канберра"
  },
  {
    question: "Какой химический элемент обозначается символом 'Fe'?",
    options: ["Фтор", "Фосфор", "Железо", "Феликс"],
    correct_answer: "Железо"
  },
  {
    question: "Самая высокая гора в мире?",
    options: ["К2", "Эверест", "Килиманджаро", "Монблан"],
    correct_answer: "Эверест"
  },
  {
    question: "Кто написал 'Войну и мир'?",
    options: ["Фёдор Достоевский", "Лев Толстой", "Антон Чехов", "Иван Тургенев"],
    correct_answer: "Лев Толстой"
  }
];

// ===============================================
// ИИ Генерация вопросов (Интеграция OpenRouter AI)
// ===============================================
async function generateQuestionsWithAI(topic = "общие знания") {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'YOUR_OPENROUTER_AI_KEY_HERE') {
    console.warn("OpenRouter API Key не установлен или некорректен. Используются тестовые вопросы.");
    return FALLBACK_QUESTIONS;
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        // Попробуйте разные модели, если одна не работает или не выдает нужный результат
        // Например: "google/gemini-flash-1.5", "mistralai/mistral-7b-instruct", "openai/gpt-3.5-turbo"
        model: "deepseek/deepseek-chat", // Актуальное имя для DeepSeek на OpenRouter
        messages: [
          {
            role: "system",
            content: `Ты эксперт по созданию вопросов для викторин. Твоя единственная задача — генерировать вопросы для викторины в очень специфическом формате JSON. НЕ включай никакой другой текст, объяснения или форматирование за пределами массива JSON. Массив JSON должен содержать ровно 50 **УНИКАЛЬНЫХ и НЕПОВТОРЯЮЩИХСЯ** вопросов. Каждый вопрос должен быть оригинальным и охватывать разные аспекты своей темы. Каждый объект вопроса должен иметь поля "question" (строка), "options" (массив из 4 строк) и "correct_answer" (строка, точно соответствующая одному из вариантов). Убедись, что все поля присутствуют и валидны. Все вопросы и варианты ответов должны быть НА РУССКОМ ЯЗЫКЕ. Пример: [{"question": "...", "options": ["...", "...", "...", "..."], "correct_answer": "..."}]`
          },
          {
            role: "user",
            // --- ИЗМЕНЕНИЕ (Промпт для user role с случайным элементом) ---
            content: `Сгенерируй 50 **разнообразных, оригинальных и уникальных** вопросов для викторины на различные темы, такие как: ${topic}. Избегай повторений или вопросов с очень похожими формулировками или ответами. Постарайся смешивать легкие, средние и сложные вопросы. Каждый вопрос должен иметь 4 варианта ответа и один правильный ответ, который является частью вариантов. Выводи только JSON массив вопросов. Вопросы и варианты ответов должны быть НА РУССКОМ ЯЗЫКЕ. **ВАЖНО: Каждый раз генерируй абсолютно новый набор вопросов, даже если темы похожи. Игнорируй следующий случайный идентификатор для генерации нового контента: ${Math.random()}.**`
            // --- КОНЕЦ ИЗМЕНЕНИЯ ---
          }
        ],
        temperature: 0.9, // Немного увеличим для большей креативности вопросов
        max_tokens: 8000 // Увеличиваем лимит токенов
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000', // Опционально: ваш домен
          'X-Title': 'Synapse Quiz Arena' // Опционально: название вашего приложения
        }
      }
    );

    const rawContent = response.data.choices[0].message.content;
    console.log("Raw AI response (first 500 chars):", rawContent.substring(0, 500) + (rawContent.length > 500 ? '...' : ''));
    console.log("Full raw AI response length:", rawContent.length);

    // Попытка извлечь JSON из строки, если AI возвращает его внутри текста (например, в ```json ... ```)
    let questions;
    const jsonMatch = rawContent.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      questions = JSON.parse(jsonMatch[1]);
    } else {
      // Если не нашли ```json```, пробуем парсить напрямую (если AI возвращает чистый JSON)
      questions = JSON.parse(rawContent);
    }

    if (!Array.isArray(questions) || questions.length === 0) {
        console.error("AI returned invalid question format or empty array after parsing:", questions);
        return FALLBACK_QUESTIONS;
    }

    // Если AI вернул больше/меньше вопросов, чем просили, можно взять первые 50
    if (questions.length > 50) {
        questions = questions.slice(0, 50);
        console.warn(`AI generated more than 50 questions, truncated to 50.`);
    } else if (questions.length < 50) {
        console.warn(`AI generated only ${questions.length} questions, expected 50. Using what's available.`);
    }

    console.log(`Generated ${questions.length} questions successfully.`);
    return questions;

  } catch (error) {
    console.error("Error generating questions with AI:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    return FALLBACK_QUESTIONS; // Возвращаем запасные вопросы в случае ошибки
  }
}


// ===============================================
// Socket.IO логика
// ===============================================
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Событие: Создать комнату
  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); // Генерируем ID комнаты
    rooms[roomId] = {
      hostId: socket.id,
      players: {
        [socket.id]: { name: playerName, score: 0 }
      },
      currentQuestionIndex: 0,
      questions: [],
      gameStarted: false,
      answeredPlayers: new Set() // Для отслеживания ответивших игроков в текущем раунде
    };
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
    console.log(`Room ${roomId} created by ${playerName} (${socket.id})`);
  });

  // Событие: Присоединиться к комнате
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    if (room && !room.gameStarted) {
      socket.join(roomId);
      room.players[socket.id] = { name: playerName, score: 0 };
      io.to(roomId).emit('playerJoined', { roomId, players: room.players, newPlayerName: playerName });
      console.log(`${playerName} (${socket.id}) joined room ${roomId}`);
    } else if (room && room.gameStarted) {
      socket.emit('joinError', 'Игра уже началась в этой комнате.');
    } else {
      socket.emit('joinError', 'Комната не найдена.');
    }
  });

  // Событие: Начать игру
  socket.on('startGame', async ({ roomId }) => {
    const room = rooms[roomId];
    if (room && socket.id === room.hostId && !room.gameStarted) {
      room.gameStarted = true;
      room.currentQuestionIndex = 0;
      // Генерируем 50 вопросов по разнообразным темам
      room.questions = await generateQuestionsWithAI("различные области знаний, такие как наука, история, география, технологии, кино, музыка, литература, спорт");
      room.answeredPlayers.clear(); // Очищаем список ответивших

      if (room.questions.length > 0) {
        io.to(roomId).emit('gameStarted');
        // Отправляем первый вопрос
        sendNextQuestion(roomId);
      } else {
          io.to(roomId).emit('error', 'Не удалось сгенерировать вопросы. Возможно, проблема с API ключом или ответом от ИИ.');
          room.gameStarted = false; // Отменяем старт игры
      }
    } else if (room && room.gameStarted) {
        socket.emit('error', 'Игра уже началась.');
    }
  });

  // Функция для отправки следующего вопроса
  function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.currentQuestionIndex < room.questions.length) {
      const questionData = room.questions[room.currentQuestionIndex];
      const questionToSend = {
        question: questionData.question,
        options: questionData.options,
        questionNumber: room.currentQuestionIndex + 1,
        totalQuestions: room.questions.length
      };
      room.answeredPlayers.clear(); // Сбрасываем ответивших для нового вопроса
      io.to(roomId).emit('newQuestion', questionToSend);
      console.log(`Room ${roomId}: Sent question ${room.currentQuestionIndex + 1}`);

      // --- ИЗМЕНЕНИЕ: УДАЛЕН БЛОК ТАЙМЕРА АВТОМАТИЧЕСКОГО ПЕРЕХОДА ---
      // Следующий код был здесь, но теперь он удален:
      /*
      setTimeout(() => {
        // Проверяем, что это все еще текущий вопрос, на случай если все ответили раньше
        if (room.currentQuestionIndex === room.questions.indexOf(questionData) && room.gameStarted) {
            console.log(`Room ${roomId}: Time's up for question ${room.currentQuestionIndex + 1}`);
            // Отправляем правильный ответ
            io.to(roomId).emit('revealAnswer', {
                correctAnswer: questionData.correct_answer,
                players: room.players // Отправляем обновленные счета
            });
            // Переход к следующему вопросу после небольшой паузы
            setTimeout(() => {
                room.currentQuestionIndex++;
                sendNextQuestion(roomId);
            }, 3000); // Пауза перед следующим вопросом
        }
      }, 15000); // 15 секунд на вопрос
      */
      // --- КОНЕЦ ИЗМЕНЕНИЯ: УДАЛЕН БЛОК ТАЙМЕРА АВТОМАТИЧЕСКОГО ПЕРЕХОДА ---

    } else {
      // Игра окончена
      io.to(roomId).emit('gameOver', { finalPlayers: room.players });
      console.log(`Room ${roomId}: Game Over.`);
      // Комнату удаляем, чтобы можно было создать новую
      delete rooms[roomId];
    }
  }

  // Событие: Отправить ответ
  socket.on('submitAnswer', ({ roomId, selectedOption }) => {
    const room = rooms[roomId];
    if (room && room.gameStarted && !room.answeredPlayers.has(socket.id)) { // Игрок может ответить только один раз за вопрос
      const currentQuestion = room.questions[room.currentQuestionIndex];

      let isCorrect = false;
      if (selectedOption === currentQuestion.correct_answer) {
        room.players[socket.id].score += 10; // Простое начисление очков
        isCorrect = true;
      }

      room.answeredPlayers.add(socket.id); // Помечаем игрока как ответившего

      socket.emit('answerResult', { isCorrect, yourScore: room.players[socket.id].score });
      io.to(roomId).emit('updateScores', room.players); // Обновляем счета у всех

      // Если все игроки ответили (или время вышло, что обрабатывается таймером)
      const allPlayersAnswered = Object.keys(room.players).every(
          playerId => room.answeredPlayers.has(playerId)
      );

      if (allPlayersAnswered) {
        console.log(`Room ${roomId}: All players answered question ${room.currentQuestionIndex + 1}`);
        io.to(roomId).emit('revealAnswer', {
            correctAnswer: currentQuestion.correct_answer,
            players: room.players
        });
        // Переход к следующему вопросу после небольшой паузы
        setTimeout(() => {
          room.currentQuestionIndex++;
          sendNextQuestion(roomId);
        }, 3000); // Пауза перед следующим вопросом
      }
    }
  });

  // Событие: Игрок покидает комнату через кнопку "Выйти"
  socket.on('leaveRoom', ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.players[socket.id]) {
      const playerName = room.players[socket.id].name;
      delete room.players[socket.id]; // Удаляем игрока из списка комнаты
      room.answeredPlayers.delete(socket.id); // Удаляем из ответивших

      socket.leave(roomId); // Удаляем игрока из комнаты Socket.IO

      if (Object.keys(room.players).length === 0) {
        // Если комната стала пустой, удаляем ее
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted as it's empty after ${playerName} left.`);
      } else {
        // Уведомляем остальных игроков об уходе
        io.to(roomId).emit('playerLeft', { playerId: socket.id, playerName: playerName, players: room.players });
        console.log(`${playerName} (${socket.id}) left room ${roomId} via button.`);

        // Если ушедший игрок был хостом, назначаем нового
        if (socket.id === room.hostId) {
          const newHostId = Object.keys(room.players)[0]; // Берем первого попавшегося
          if (newHostId) { // Если есть еще игроки
              room.hostId = newHostId;
              io.to(roomId).emit('newHost', newHostId);
              console.log(`Room ${roomId}: New host is ${room.players[newHostId].name} (${newHostId})`);
          } else { // Если хост был последним, комната уже должна была удалиться
              delete rooms[roomId]; // Просто на всякий случай
              console.log(`Room ${roomId} deleted as host left and no players remain.`);
          }
        }
      }
    }
  });


  // Событие: Отключение пользователя (например, закрытие вкладки браузера)
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Ищем, в какой комнате был пользователь и удаляем его
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        const room = rooms[roomId];
        const playerName = room.players[socket.id].name;
        delete room.players[socket.id];
        room.answeredPlayers.delete(socket.id); // Удаляем из ответивших

        // Если комната пуста, удаляем ее
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
          console.log(`Room ${roomId} deleted as it's empty.`);
        } else {
          // Уведомляем остальных игроков об уходе
          io.to(roomId).emit('playerLeft', { playerId: socket.id, playerName: playerName, players: room.players });
          console.log(`${playerName} (${socket.id}) left room ${roomId} (disconnect).`);

          // Если ушедший игрок был хостом, назначаем нового
          if (socket.id === room.hostId) {
            const newHostId = Object.keys(room.players)[0];
            if (newHostId) { // Если есть еще игроки
                room.hostId = newHostId;
                io.to(roomId).emit('newHost', newHostId);
                console.log(`Room ${roomId}: New host is ${room.players[newHostId].name} (${newHostId})`);
            } else { // Если хост был последним
                delete rooms[roomId];
                console.log(`Room ${roomId} deleted as host left and no players remain.`);
            }
          }
        }
        break; // Выходим из цикла, т.к. игрок найден и обработан
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});