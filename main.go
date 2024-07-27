package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type Room struct {
	Name      string `json:"name"`
	Password  string `json:"password,omitempty"`
	IsPrivate bool   `json:"is_private"`
}

type PasswordCheckRequest struct {
	RoomID   string `json:"room_id"`
	Password string `json:"password"`
}

type RoomInfoResponse struct {
	RoomID string   `json:"room_id"`
	Users  []string `json:"users"`
}

type RoomDetails struct {
	Name      string
	Password  string
	IsPrivate bool
}

type ConnectionManager struct {
	mu          sync.Mutex
	activeConns map[*websocket.Conn]bool
	rooms       map[string]map[string]*websocket.Conn
	roomDetails map[string]RoomDetails
	roomTimers  map[string]*time.Timer
	upgrader    websocket.Upgrader
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		activeConns: make(map[*websocket.Conn]bool),
		rooms:       make(map[string]map[string]*websocket.Conn),
		roomDetails: make(map[string]RoomDetails),
		roomTimers:  make(map[string]*time.Timer),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
}

func generateRoomHash(roomName string) string {
	hash := sha256.New()
	hash.Write([]byte(fmt.Sprintf("%s%v", roomName, time.Now().UnixNano())))
	return hex.EncodeToString(hash.Sum(nil))[:8]
}

func (manager *ConnectionManager) connect(c *gin.Context, room, userID, password string) (*websocket.Conn, error) {
	fmt.Println("Attempting to upgrade to WebSocket...")
	conn, err := manager.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		fmt.Printf("WebSocket upgrade error: %v\n", err)
		return nil, err
	}

	fmt.Println("WebSocket connection established")

	manager.mu.Lock()
	defer manager.mu.Unlock()

	if _, ok := manager.rooms[room]; !ok {
		fmt.Println("Room does not exist")
		conn.Close()
		return nil, errors.New("room does not exist")
	}

	roomPassword := manager.roomDetails[room].Password
	if roomPassword != "" && roomPassword != password {
		fmt.Println("Invalid password")
		conn.Close()
		return nil, errors.New("invalid password")
	}

	if manager.rooms[room] == nil {
		manager.rooms[room] = make(map[string]*websocket.Conn)
	}
	manager.rooms[room][userID] = conn
	manager.activeConns[conn] = true

	if timer, ok := manager.roomTimers[room]; ok {
		timer.Stop()
		delete(manager.roomTimers, room)
	}

	go manager.sendUserCount(room)
	return conn, nil
}

func (manager *ConnectionManager) disconnect(conn *websocket.Conn) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	delete(manager.activeConns, conn)
	for room, users := range manager.rooms {
		for userID, ws := range users {
			if ws == conn {
				delete(manager.rooms[room], userID)
				if len(manager.rooms[room]) == 0 {
					manager.roomTimers[room] = time.AfterFunc(5*time.Minute, func() {
						manager.deleteRoom(room)
					})
				}
				go manager.sendUserCount(room)
				go manager.broadcastPeerLeft(room, userID)
				break
			}
		}
	}
	conn.Close()
}

func (manager *ConnectionManager) broadcast(message string, room string) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	for _, conn := range manager.rooms[room] {
		if err := conn.WriteMessage(websocket.TextMessage, []byte(message)); err != nil {
			fmt.Printf("Error broadcasting message: %v\n", err)
		}
	}
}

func (manager *ConnectionManager) broadcastNewPeer(room, newPeerID string) {
	message := fmt.Sprintf(`{"type":"new_peer","peerId":"%s"}`, newPeerID)
	manager.broadcast(message, room)
}

func (manager *ConnectionManager) broadcastPeerLeft(room, peerID string) {
	message := fmt.Sprintf(`{"type":"peer_left","peerId":"%s"}`, peerID)
	manager.broadcast(message, room)
}

func (manager *ConnectionManager) sendUserCount(room string) {
	for {
		manager.mu.Lock()
		userCount := len(manager.rooms[room])
		manager.mu.Unlock()

		message := fmt.Sprintf(`{"type":"user_count","user_count":%d}`, userCount)
		manager.broadcast(message, room)
		time.Sleep(5 * time.Second)
	}
}

func (manager *ConnectionManager) deleteRoom(room string) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	if len(manager.rooms[room]) == 0 {
		delete(manager.rooms, room)
		delete(manager.roomDetails, room)
		delete(manager.roomTimers, room)
		fmt.Printf("Room %s deleted due to inactivity\n", room)
	}
}

func (manager *ConnectionManager) getRoomInfo() []map[string]interface{} {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	roomsInfo := []map[string]interface{}{}
	for roomID, details := range manager.roomDetails {
		roomsInfo = append(roomsInfo, map[string]interface{}{
			"id":           roomID,
			"name":         details.Name,
			"has_password": details.Password != "",
			"is_private":   details.IsPrivate,
			"user_count":   len(manager.rooms[roomID]),
		})
	}
	return roomsInfo
}

func main() {
	r := gin.Default()
	manager := NewConnectionManager()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost", "http://127.0.0.1:8000", "http://chat.deeptoon.co.kr"},
		AllowMethods:     []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Static("/static", "./static")

	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})

	r.GET("/create_room.html", func(c *gin.Context) {
		c.File("./static/create_room.html")
	})

	r.GET("/room.html", func(c *gin.Context) {
		c.File("./static/room.html")
	})

	r.GET("/room_list.html", func(c *gin.Context) {
		c.File("./static/room_list.html")
	})

	r.GET("/ws", func(c *gin.Context) {
		room := c.Query("room")
		userID := c.Query("user_id")
		password := c.Query("password")

		fmt.Printf("WebSocket request received: room=%s, user_id=%s\n", room, userID)

		conn, err := manager.connect(c, room, userID, password)
		if err != nil {
			fmt.Printf("Error connecting: %v\n", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		defer manager.disconnect(conn)

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				fmt.Printf("Error reading message: %v\n", err)
				break
			}

			var data map[string]interface{}
			if err := json.Unmarshal(message, &data); err != nil {
				fmt.Printf("Invalid JSON: %v\n", err)
				continue
			}

			messageType := data["type"]
			if messageType == "chat" {
				manager.broadcast(string(message), room)
			} else {
				manager.broadcast(string(message), room)
			}
		}
	})

	r.GET("/room/:room_id/users", func(c *gin.Context) {
		roomID := c.Param("room_id")
		manager.mu.Lock()
		defer manager.mu.Unlock()

		users, ok := manager.rooms[roomID]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Room not found"})
			return
		}

		userIDs := []string{}
		for userID := range users {
			userIDs = append(userIDs, userID)
		}

		c.JSON(http.StatusOK, RoomInfoResponse{RoomID: roomID, Users: userIDs})
	})

	r.GET("/rooms", func(c *gin.Context) {
		c.JSON(http.StatusOK, manager.getRoomInfo())
	})

	r.POST("/rooms", func(c *gin.Context) {
		var room Room
		if err := c.ShouldBindJSON(&room); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		manager.mu.Lock()
		defer manager.mu.Unlock()

		for _, details := range manager.roomDetails {
			if details.Name == room.Name {
				c.JSON(http.StatusBadRequest, gin.H{"detail": "Room name already exists"})
				return
			}
		}

		var roomID string
		if room.IsPrivate {
			roomID = generateRoomHash(room.Name)
		} else {
			roomID = strconv.Itoa(len(manager.rooms) + 1)
		}

		manager.rooms[roomID] = make(map[string]*websocket.Conn)
		manager.roomDetails[roomID] = RoomDetails{
			Name:      room.Name,
			Password:  room.Password,
			IsPrivate: room.IsPrivate,
		}

		c.JSON(http.StatusOK, gin.H{"id": roomID, "name": room.Name, "is_private": room.IsPrivate})
	})

	r.POST("/check_password", func(c *gin.Context) {
		var payload PasswordCheckRequest
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		manager.mu.Lock()
		defer manager.mu.Unlock()

		room, ok := manager.roomDetails[payload.RoomID]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"detail": "Room does not exist"})
			return
		}

		if room.Password != payload.Password {
			c.JSON(http.StatusForbidden, gin.H{"detail": "Invalid password"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"detail": "Password is correct"})
	})

	r.Run(":8000")
}
