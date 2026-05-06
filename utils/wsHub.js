let esp32Clients = new Set();

function addClient(ws) {
  esp32Clients.add(ws);

  ws.on("close", () => {
    esp32Clients.delete(ws);
    console.log("ESP32 WebSocket disconnected");
  });

  ws.on("error", () => {
    esp32Clients.delete(ws);
  });
}

function broadcastControl(data) {
  const message = JSON.stringify({
    type: "control",
    data: data
  });

  esp32Clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function getClientCount() {
  return esp32Clients.size;
}

module.exports = {
  addClient,
  broadcastControl,
  getClientCount
};