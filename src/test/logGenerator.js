// test/logGenerator.js
// Веселый генератор логов для тестирования перехватчика терминала

const LEVELS = ['INFO', 'DEBUG', 'WARN', 'ERROR', 'TRACE', 'SUCCESS'];
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

const EMOJIS = ['🚀', '⚡', '🔥', '💥', '✨', '🎯', '🎨', '🎪', '🎭', '🎸', '🎺', '🎻', '🎲', '🎰', '🎳'];
const MESSAGES = [
    'Запуск подсистемы обработки данных',
    'Получен запрос от клиента',
    'Обработка транзакции завершена',
    'Кэширование данных в памяти',
    'Синхронизация с удаленным сервером',
    'Оптимизация запроса к БД',
    'Валидация входных параметров',
    'Инициализация модуля логирования',
    'Подключение к внешнему API',
    'Парсинг конфигурационного файла',
    'Генерация отчета',
    'Сериализация объекта',
    'Десериализация JSON',
    'Компиляция шаблона',
    'Рендеринг интерфейса',
    'Проверка прав доступа',
    'Аутентификация пользователя',
    'Обновление индексов',
    'Очистка временных файлов',
    'Резервное копирование данных',
    'Восстановление из бэкапа',
    'Миграция базы данных',
    'Индексация документов',
    'Поиск по базе знаний',
    'Агрегация статистики',
    'Отправка уведомления',
    'Получение webhook',
    'Обработка очереди сообщений',
    'Балансировка нагрузки',
    'Масштабирование кластера'
];

function getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
}

function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatLog(level, message, extra = null) {
    const timestamp = getTimestamp();
    const emoji = randomChoice(EMOJIS);
    
    let color = COLORS.white;
    let levelStr = level;
    
    switch (level) {
        case 'ERROR':
            color = COLORS.red + COLORS.bright;
            levelStr = `[${level}]`;
            break;
        case 'WARN':
            color = COLORS.yellow;
            levelStr = `[${level}]`;
            break;
        case 'SUCCESS':
            color = COLORS.green;
            levelStr = `[${level}]`;
            break;
        case 'DEBUG':
            color = COLORS.gray;
            levelStr = `[${level}]`;
            break;
        case 'TRACE':
            color = COLORS.magenta;
            levelStr = `[${level}]`;
            break;
        default:
            color = COLORS.cyan;
            levelStr = `[${level}]`;
    }
    
    let logLine = `${COLORS.gray}[${timestamp}]${COLORS.reset} ${color}${levelStr.padEnd(9)}${COLORS.reset} ${emoji} ${message}`;
    
    if (extra) {
        logLine += ` ${COLORS.gray}(${extra})${COLORS.reset}`;
    }
    
    return logLine;
}

function generateLog() {
    const level = randomChoice(LEVELS);
    const message = randomChoice(MESSAGES);
    
    let extra = null;
    if (Math.random() > 0.7) {
        extra = `duration=${randomInt(1, 5000)}ms`;
    } else if (Math.random() > 0.7) {
        extra = `userId=${randomInt(1000, 9999)}`;
    } else if (Math.random() > 0.7) {
        extra = `requestId=${Math.random().toString(36).substring(7)}`;
    }
    
    return formatLog(level, message, extra);
}

function printBanner() {
    console.log(`
${COLORS.cyan}${COLORS.bright}╔═══════════════════════════════════════════════════════════╗
║         🚀 ГЕНЕРАТОР ЛОГОВ ДЛЯ ТЕСТА ПЕРЕХВАТЧИКА 🚀          ║
╚═══════════════════════════════════════════════════════════════╝${COLORS.reset}

Режимы работы:
  ${COLORS.green}[1]${COLORS.reset} Бешеный режим (без задержки) - МАКСИМУМ логов!
  ${COLORS.yellow}[2]${COLORS.reset} Быстрый режим (10ms задержка)
  ${COLORS.blue}[3]${COLORS.reset} Средний режим (100ms задержка)
  ${COLORS.magenta}[4]${COLORS.reset} Медленный режим (1000ms задержка)
  ${COLORS.red}[5]${COLORS.reset} Взрывной режим (пачки по 100 логов)
  ${COLORS.gray}[0]${COLORS.reset} Выход

Выбери режим (0-5): `);
}

async function runMode(mode) {
    let count = 0;
    let running = true;
    
    process.on('SIGINT', () => {
        console.log(`\n${COLORS.yellow}⏹ Остановлено. Всего сгенерировано логов: ${count}${COLORS.reset}`);
        running = false;
        process.exit(0);
    });
    
    console.log(`\n${COLORS.green}▶ Запуск режима ${mode}. Нажми Ctrl+C для остановки.${COLORS.reset}\n`);
    
    while (running) {
        switch (mode) {
            case 1: // Бешеный
                console.log(generateLog());
                count++;
                break;
                
            case 2: // Быстрый
                console.log(generateLog());
                count++;
                await new Promise(r => setTimeout(r, 10));
                break;
                
            case 3: // Средний
                console.log(generateLog());
                count++;
                await new Promise(r => setTimeout(r, 100));
                break;
                
            case 4: // Медленный
                console.log(generateLog());
                count++;
                await new Promise(r => setTimeout(r, 1000));
                break;
                
            case 5: // Взрывной
                for (let i = 0; i < 100; i++) {
                    console.log(generateLog());
                    count++;
                }
                await new Promise(r => setTimeout(r, 500));
                break;
        }
        
        // Каждые 1000 логов показываем статистику
        if (count > 0 && count % 1000 === 0) {
            console.log(`${COLORS.yellow}📊 Статистика: сгенерировано ${count} логов${COLORS.reset}`);
        }
    }
}

// Основная логика
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

printBanner();

rl.on('line', (answer) => {
    const mode = parseInt(answer.trim());
    
    if (mode === 0) {
        console.log(`${COLORS.yellow}👋 Выход...${COLORS.reset}`);
        rl.close();
        process.exit(0);
    }
    
    if (mode >= 1 && mode <= 5) {
        rl.close();
        runMode(mode);
    } else {
        console.log(`${COLORS.red}❌ Неверный режим. Попробуй еще раз:${COLORS.reset}`);
        printBanner();
    }
});