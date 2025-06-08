import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

const socket = io('https://synapse-quiz-arena.onrender.com'); // Подключаемся к бэкенду

function App() {
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [players, setPlayers] = useState({}); // { socketId: { name, score } }
  const [question, setQuestion] = useState(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [answerResult, setAnswerResult] = useState(null); // { isCorrect: boolean, yourScore: number }
  const [selectedOption, setSelectedOption] = useState(null); // Для отслеживания выбранного ответа
  const [correctAnswer, setCorrectAnswer] = useState(null); // Для отображения правильного ответа
  const [gameOver, setGameOver] = useState(false);
  const [finalPlayers, setFinalPlayers] = useState({});
  const [isHost, setIsHost] = useState(false);
  // --- ИЗМЕНЕНИЕ (Добавлено состояние для загрузки) ---
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false); // Новое состояние для отслеживания загрузки
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---

  // Эффект для обработки событий Socket.IO
  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players }) => {
      setCurrentRoomId(roomId);
      setPlayers(players);
      setIsHost(true);
      console.log(`Room created: ${roomId}`);
    });

    socket.on('playerJoined', ({ roomId, players, newPlayerName }) => {
      setPlayers(players);
      setCurrentRoomId(roomId); // В случае, если игрок присоединился к существующей комнате
      console.log(`${newPlayerName} joined room ${roomId}`);
    });

    socket.on('playerLeft', ({ playerName, players }) => {
      setPlayers(players);
      console.log(`${playerName} left the room.`);
    });

    socket.on('newHost', (newHostId) => {
        setIsHost(socket.id === newHostId);
        console.log(`New host is ${newHostId}`);
    });

    // --- ИЗМЕНЕНИЕ (Сброс isLoadingQuestions) ---
    socket.on('gameStarted', () => {
      setGameStarted(true);
      setQuestion(null);
      setAnswerResult(null);
      setSelectedOption(null);
      setCorrectAnswer(null);
      setGameOver(false);
      setIsLoadingQuestions(false); // Сбрасываем флаг загрузки при успешном старте
      console.log('Game started!');
    });
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---

    socket.on('newQuestion', (q) => {
      setQuestion(q);
      setAnswerResult(null); // Сбросить результат предыдущего ответа
      setSelectedOption(null); // Сбросить выбранный ответ
      setCorrectAnswer(null); // Сбросить правильный ответ
      console.log('New question:', q);
    });

    socket.on('answerResult', (result) => {
      setAnswerResult(result);
      console.log('Your answer result:', result);
    });

    socket.on('updateScores', (updatedPlayers) => {
      setPlayers(updatedPlayers);
      console.log('Scores updated:', updatedPlayers);
    });

    socket.on('revealAnswer', ({ correctAnswer, players: updatedPlayers }) => {
        setCorrectAnswer(correctAnswer);
        setPlayers(updatedPlayers); // Обновить счета после раунда
        console.log(`Correct answer: ${correctAnswer}`);
    });

    socket.on('gameOver', ({ finalPlayers }) => {
      setGameStarted(false);
      setGameOver(true);
      setFinalPlayers(finalPlayers);
      setQuestion(null);
      setAnswerResult(null);
      setSelectedOption(null);
      setCorrectAnswer(null);
      console.log('Game Over!', finalPlayers);
    });

    socket.on('joinError', (message) => {
      alert(`Ошибка: ${message}`);
      setCurrentRoomId(null); // Сбросить состояние, если не удалось присоединиться
    });

    // --- ИЗМЕНЕНИЕ (Сброс isLoadingQuestions при ошибке) ---
    socket.on('error', (message) => {
        alert(`Произошла ошибка: ${message}`);
        setIsLoadingQuestions(false); // Сбрасываем флаг загрузки при ошибке
    });
    // --- КОНЕЦ ИЗМЕНЕНИЯ ---


    return () => {
      socket.off('roomCreated');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('newHost');
      socket.off('gameStarted');
      socket.off('newQuestion');
      socket.off('answerResult');
      socket.off('updateScores');
      socket.off('revealAnswer');
      socket.off('gameOver');
      socket.off('joinError');
      socket.off('error');
    };
  }, []);

  const handleCreateRoom = () => {
    if (playerName.trim()) {
      socket.emit('createRoom', { playerName });
    } else {
      alert('Пожалуйста, введите ваше имя.');
    }
  };

  const handleJoinRoom = () => {
    if (playerName.trim() && roomId.trim()) {
      socket.emit('joinRoom', { roomId: roomId.toUpperCase(), playerName });
    } else {
      alert('Пожалуйста, введите ваше имя и ID комнаты.');
    }
  };

  // --- ИЗМЕНЕНИЕ (Установка isLoadingQuestions) ---
  const handleStartGame = () => {
    if (currentRoomId) {
      setIsLoadingQuestions(true); // Устанавливаем флаг загрузки
      socket.emit('startGame', { roomId: currentRoomId });
    }
  };
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---

  const handleSubmitAnswer = (option) => {
    if (question && !selectedOption) { // Ответить можно только один раз за вопрос
      setSelectedOption(option);
      socket.emit('submitAnswer', { roomId: currentRoomId, selectedOption: option });
    }
  };

  // --- ИЗМЕНЕНИЕ (Новая функция для выхода из комнаты) ---
  const handleLeaveRoom = () => {
    if (currentRoomId) {
      socket.emit('leaveRoom', { roomId: currentRoomId });
      // Сбросить состояние фронтенда, чтобы вернуться на главный экран
      setCurrentRoomId(null);
      setGameStarted(false);
      setGameOver(false);
      setPlayerName(''); // Очистить имя, если нужно, для новой игры
      setRoomId('');     // Очистить ID комнаты для новой игры
      setPlayers({});
      setQuestion(null);
      setAnswerResult(null);
      setSelectedOption(null);
      setCorrectAnswer(null);
      setFinalPlayers({});
      setIsHost(false);
    }
  };
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---


  const getSortedPlayers = (playersObj) => {
    return Object.values(playersObj).sort((a, b) => b.score - a.score);
  };

  if (!currentRoomId) {
    // Экран ввода имени и выбора комнаты
    return (
      <div className="container">
        <h1>Synapse Quiz Arena</h1>
        <input
          type="text"
          placeholder="Ваше имя"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        <br />
        <button onClick={handleCreateRoom} disabled={!playerName.trim()}>Создать Комнату</button>
        <br />
        <input
          type="text"
          placeholder="ID комнаты"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
        />
        <button onClick={handleJoinRoom} disabled={!playerName.trim() || !roomId.trim()}>Присоединиться</button>
      </div>
    );
  }

  if (gameStarted) {
    // Экран игры
    return (
      <div className="container game-screen">
        <h2>Игра в комнате: <span className="room-id-display">{currentRoomId}</span></h2>
        {/* --- ИЗМЕНЕНИЕ (Кнопка выхода на игровом экране) --- */}
        <button onClick={handleLeaveRoom} style={{marginBottom: '20px'}}>Выйти из комнаты</button>
        {/* --- КОНЕЦ ИЗМЕНЕНИЯ --- */}

        {question ? (
          <div className="question-card">
            <p className="question-text">Вопрос {question.questionNumber} из {question.totalQuestions}:<br/>{question.question}</p>
            <div className="options-grid">
              {question.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleSubmitAnswer(option)}
                  disabled={!!selectedOption} // Деактивировать после выбора
                  className={
                    selectedOption === option
                      ? (answerResult?.isCorrect ? 'correct-answer' : 'wrong-answer')
                      : (correctAnswer === option ? 'correct-answer' : '')
                  }
                >
                  {option}
                </button>
              ))}
            </div>
            {correctAnswer && (
                <p className="game-status-message">Правильный ответ: <span style={{color: '#00ff00'}}>{correctAnswer}</span></p>
            )}
            {answerResult && (
                <p className="game-status-message">
                    Ваш ответ: {answerResult.isCorrect ? 'Правильно!' : 'Неправильно!'} Текущий счет: {answerResult.yourScore}
                </p>
            )}
          </div>
        ) : (
          <p className="game-status-message">Ожидание первого вопроса...</p>
        )}

        <div className="leaderboard">
            <h3>Счета игроков</h3>
            <ul>
                {getSortedPlayers(players).map((player) => (
                    <li key={player.name}>
                        <span className="name">{player.name} {socket.id === Object.keys(players).find(id => players[id] === player) ? '(Вы)' : ''}</span>
                        <span className="score">{player.score}</span>
                    </li>
                ))}
            </ul>
        </div>
      </div>
    );
  }

  if (gameOver) {
      // Экран окончания игры
      return (
          <div className="container game-over-screen">
              <h1>Игра Окончена!</h1>
              <div className="leaderboard">
                  <h3>Финальный Результат</h3>
                  <ul>
                      {getSortedPlayers(finalPlayers).map((player, index) => (
                          <li key={player.name}>
                              <span className="name">{index + 1}. {player.name}</span>
                              <span className="score">{player.score} очков</span>
                          </li>
                      ))}
                  </ul>
              </div>
              <button onClick={() => {
                  // Сброс состояния для новой игры или выхода
                  setCurrentRoomId(null);
                  setGameStarted(false);
                  setGameOver(false);
                  setPlayerName('');
                  setRoomId('');
                  setPlayers({});
                  setQuestion(null);
                  setAnswerResult(null);
                  setSelectedOption(null);
                  setCorrectAnswer(null);
                  setFinalPlayers({});
                  setIsHost(false);
              }}>Начать Новую Игру</button>
              {/* --- ИЗМЕНЕНИЕ (Кнопка выхода после окончания игры) --- */}
              <button onClick={handleLeaveRoom} style={{marginTop: '10px'}}>Выйти из комнаты</button>
              {/* --- КОНЕЦ ИЗМЕНЕНИЯ --- */}
          </div>
      );
  }

  // Экран лобби
  return (
    <div className="container lobby-screen">
      <h1>Лобби комнаты</h1>
      <div className="room-info">
        <p>ID вашей комнаты: <span className="room-id-display">{currentRoomId}</span></p>
        <p>Поделитесь этим ID, чтобы другие игроки могли присоединиться!</p>
        <p>Вы: {playerName} {isHost && '(Хост)'}</p>
      </div>

      <h3>Игроки в комнате:</h3>
      <ul className="room-players">
        {Object.values(players).map((player) => (
          <li key={player.name} className="player-item">
            <span>{player.name}</span>
            <span>Счет: {player.score}</span>
          </li>
        ))}
      </ul>

      {/* --- ИЗМЕНЕНИЕ (Кнопка выхода в лобби) --- */}
      <button onClick={handleLeaveRoom}>Выйти из комнаты</button>
      {/* --- КОНЕЦ ИЗМЕНЕНИЯ --- */}

      {/* --- ИЗМЕНЕНИЕ (Условный рендеринг кнопки "Начать Игру" и сообщения загрузки) --- */}
      {isLoadingQuestions ? (
        <p className="loading-message">
          <span className="spinner"></span>
          Генерация вопросов ИИ... Это может занять некоторое время.
        </p>
      ) : (
        isHost && (
          <button onClick={handleStartGame} disabled={Object.keys(players).length < 1}>
            Начать Игру
          </button>
        )
      )}
      {!isHost && !isLoadingQuestions && ( // Убедимся, что это сообщение не конфликтует с загрузкой
          <p className="game-status-message">Ожидание, пока хост начнет игру...</p>
      )}
      {/* --- КОНЕЦ ИЗМЕНЕНИЯ --- */}
    </div>
  );
}

export default App;