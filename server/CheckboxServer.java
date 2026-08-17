package server;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * チェックボックス状態共有用の軽量REST APIサーバー
 * 外部ライブラリに依存せず、Java標準ライブラリ（HttpServer）のみで動作します。
 */
public class CheckboxServer {

    private static final Logger LOGGER = Logger.getLogger(CheckboxServer.class.getName());

    // サーバー設定用定数
    public static final String HOST = "127.0.0.1";
    public static final int PORT = 8080;
    public static final String API_PATH = "/api/states";
    public static final String STATES_FILE_PATH = "states.json";

    public static void main(String[] args) {
        try {
            InetSocketAddress address = new InetSocketAddress(HOST, PORT);
            HttpServer server = HttpServer.create(address, 0);

            // APIエンドポイントの登録
            server.createContext(API_PATH, new StatesHandler(Paths.get(STATES_FILE_PATH)));

            // スレッドプールの設定
            server.setExecutor(Executors.newFixedThreadPool(4));

            server.start();
            LOGGER.info(String.format("CheckboxServer started successfully on http://%s:%d%s", HOST, PORT, API_PATH));
        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Failed to start CheckboxServer", e);
            System.exit(1);
        }
    }

    /**
     * チェック状態の取得(GET)および保存(POST)を行うハンドラー
     */
    static class StatesHandler implements HttpHandler {
        private final Path storagePath;

        public StatesHandler(Path storagePath) {
            this.storagePath = storagePath;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String method = exchange.getRequestMethod().toUpperCase();

            // レスポンスヘッダーの設定（JSON & CORS）
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");

            try {
                switch (method) {
                    case "OPTIONS":
                        handleOptions(exchange);
                        break;
                    case "GET":
                        handleGet(exchange);
                        break;
                    case "POST":
                        handlePost(exchange);
                        break;
                    default:
                        sendResponse(exchange, 405, "{\"error\":\"Method Not Allowed\"}");
                        break;
                }
            } catch (Exception e) {
                LOGGER.log(Level.SEVERE, "Error handling request: " + method + " " + exchange.getRequestURI(), e);
                sendResponse(exchange, 500, "{\"error\":\"Internal Server Error\"}");
            }
        }

        private void handleOptions(HttpExchange exchange) throws IOException {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        }

        private void handleGet(HttpExchange exchange) throws IOException {
            String jsonContent;
            if (Files.exists(storagePath)) {
                jsonContent = Files.readString(storagePath, StandardCharsets.UTF_8);
                if (jsonContent.trim().isEmpty()) {
                    jsonContent = "{}";
                }
            } else {
                jsonContent = "{}";
            }
            sendResponse(exchange, 200, jsonContent);
        }

        private void handlePost(HttpExchange exchange) throws IOException {
            InputStream is = exchange.getRequestBody();
            byte[] bodyBytes = is.readAllBytes();
            String requestBody = new String(bodyBytes, StandardCharsets.UTF_8).trim();

            if (requestBody.isEmpty()) {
                requestBody = "{}";
            }

            // states.json へアトミックに書き込み
            synchronized (this) {
                Files.writeString(
                    storagePath,
                    requestBody,
                    StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE,
                    StandardOpenOption.TRUNCATE_EXISTING,
                    StandardOpenOption.WRITE
                );
            }

            String response = "{\"status\":\"success\",\"message\":\"States saved successfully\"}";
            sendResponse(exchange, 200, response);
        }

        private void sendResponse(HttpExchange exchange, int statusCode, String responseText) throws IOException {
            byte[] bytes = responseText.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statusCode, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }
    }
}
