import { useState, useEffect, useCallback } from "react";
import { socket } from "./socket";
import { Text, Box, Flex, Button, VStack, useToast } from "@chakra-ui/react";
import { KeyBox } from "./components/KeyBox";
import { RoomCode } from "./components/RoomCode";
import CustomSuccessToast from "./components/CustomSuccessToast";
import { ConnectionStatus } from "./components/ConnectionStatus";
import {
  GAME_COUNTER_ENDPOINT,
  USER_COOKIE_NAME,
  USER_COUNTER_ENDPOINT,
} from "./global";
import axios from "axios";
import { useNavigate } from "react-router";
import { DuoNavBar } from "./components/DuoNavBar";

const userJoinToastId = "user-toast";

export default function GameRoom() {
  let navigate = useNavigate();

  const [isConnected, setIsConnected] = useState(socket.connected);
  const [events, setEvents] = useState([]);
  const [roomCode, setRoomCode] = useState(null);
  const [keysPressed, setKeysPressed] = useState({});
  const [numberOfPlayers, setNumberOfPlayers] = useState(0);
  const [lastKeyPressTime, setLastKeyPressTime] = useState(Date.now());

  const [keys, setKeys] = useState([]);
  const newUserToast = useToast();

  function onDisconnect() {
    setIsConnected(false);
    setRoomCode(null);
    setEvents([]);
    navigate("/");
  }

  async function setCookieIfNotExists() {
    // Check if the cookie is set
    const cookieName = USER_COOKIE_NAME;
    const cookieExists = document.cookie
      .split(";")
      .some((item) => item.trim().startsWith(cookieName + "="));

    if (!cookieExists) {
      // Set the cookie if not exists
      await axios.get(`${USER_COUNTER_ENDPOINT}/up`);
      document.cookie = `${cookieName}=${cookieName}; path=/;`;
      console.log("Cookie has been set!");
    }
  }

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
      setRoomCode(socket.id);
      console.log(socket.id);
      socket.emit("join-room", socket.id);
    }

    function onKeystroke(keyEvent) {
      setLastKeyPressTime(Date.now());
      const value = `keystroke received: ${keyEvent.keyDir} ${keyEvent.keyCode}`;

      if (keyEvent.keyDir === "keyup") {
        setKeys((prev) => [
          ...prev,
          {
            key: keyEvent.keyCode,
            // need to add a math.random here instead of the current time just in case the same key was pressed at the same time
            id: `${keyEvent.timestamp}_${Math.floor(Math.random() * 100) + 1}_${
              keyEvent.keyCode
            }`,
          },
        ]);
      }

      setEvents((previous) => [...previous, value]);
    }

    function onRoomUpdate(update) {
      setEvents((previous) => [...previous, update]);
      // since the actual user being in the room counts as 1, update that a new user has joined the room only when there is > 1 user
      console.log(update, socket, update.roomId === socket.id);
      // TODO: need to set a cap on the number of new user banners that appear since multiple users can join at the same time
      if (
        // update.socketId === socket.id &&
        update.newUser &&
        update.numberOfUsers > 1 &&
        !newUserToast.isActive(userJoinToastId)
      ) {
        newUserToast({
          title: "New User Joined!",
          status: "success",
          duration: 1500,
          isClosable: true,
          id: userJoinToastId,
          render: ({ title }) => <CustomSuccessToast title={title} />,
        });

        setNumberOfPlayers(update.numberOfUsers);
      } else if (update.roomId === socket.id && update.userDisconnected) {
        console.log("A user has disconnected");
        setNumberOfPlayers((numPlayers) => numPlayers - 1);
      }
    }

    const handleKeyDown = (event) => {
      if (!keysPressed[event.key]) {
        setKeysPressed((prev) => ({ ...prev, [event.key]: true }));

        // // make the assumption that no one would hold down the key
        // // which I can optionally handle later as well

        socket.emit(
          "keystroke",
          { keyDir: "keydown", keyCode: event.key, timestamp: event.timeStamp },
          roomCode
        );
      }
    };

    // Handle keyup event
    const handleKeyUp = (event) => {
      setKeysPressed((prev) => ({ ...prev, [event.key]: false }));
      socket.emit(
        "keystroke",
        { keyDir: "keyup", keyCode: event.key, timestamp: event.timeStamp },
        roomCode
      );
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("keystroke", onKeystroke);
    socket.on("room-status", onRoomUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("keystroke", onKeystroke);
      socket.off("room-status", onRoomUpdate);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [roomCode, keysPressed, keys, newUserToast]);

  useEffect(() => {
    //check if inactive user
    const interval = setInterval(() => {
      if (isConnected) {
        const currentTime = Date.now();
        const timeSinceLastEvent = currentTime - lastKeyPressTime;
        if (timeSinceLastEvent >= 180000) {
          if (socket.connected) {
            socket.disconnect();
          } else {
            onDisconnect();
          }
        }
      }
    }, 180000); // Check every minute
    return () => clearInterval(interval);
  }, [lastKeyPressTime, isConnected]);

  const handleBackNavigation = () => {
    if (socket.connected) {
      socket.disconnect();
    } else {
      onDisconnect();
    }
  }

  const generateRoom = useCallback(async () => {
    socket.connect();
    setNumberOfPlayers(1);
    await axios.get(`${GAME_COUNTER_ENDPOINT}/up`);
    setCookieIfNotExists();
  }, []);

  useEffect(() => {
    (async () => await generateRoom())();
    window.addEventListener("popstate", handleBackNavigation);
    return () => window.removeEventListener("popstate", handleBackNavigation);
  }, [generateRoom]);

  return (
    <div className="App">
      <DuoNavBar
        handleLogoClick={() => {
          if (socket.connected) {
            socket.disconnect();
          } else {
            onDisconnect(0);
          }
        }}
      />
      <Flex
        height="80vh"
        justifyContent="center"
        alignItems="center"
        flexDir="column"
        pt="5rem"
      >
        <VStack>
          <Text
            color="black"
            fontSize="4xl"
            fontWeight="semibold"
            px={{ base: "2rem", md: "5rem" }}
            textAlign="center"
          >
            Your room code:
          </Text>
          <RoomCode roomCode={roomCode} onDisconnect={onDisconnect} />
        </VStack>
        <Box mt={12}>
          <ConnectionStatus isConnected={isConnected} />
          <Flex gap={3}>
            <Text color="black" fontSize="2xl">
              Number of players in room:
            </Text>
            <Text color="black" fontSize="2xl" fontWeight="semibold">
              {numberOfPlayers}
            </Text>
          </Flex>
        </Box>
        <Box marginTop={5} overflowX={"hidden"} padding={10} width={"87.5%"}>
          <Flex gap={3} justifyContent={"center"}>
            {keys.map(({ key, id }) => (
              // pass in identifier so the child component knows which element to remove from the array
              <KeyBox
                inputKey={key}
                key={id}
                boxIdentifier={id}
                setKeys={setKeys}
              />
            ))}
          </Flex>
        </Box>
        <Flex h="100%" alignItems="end" justifyContent="end" px="2rem">
          <Text fontSize={{ base: "md", md: "xl" }}>
            Have your partner (with our extension installed) choose a game from{" "}
            <Text as="span">
              <a
                href="https://www.twoplayergames.org/"
                target="_blank"
                style={{ "text-decoration": "underline" }}
              >
                twoplayergames.org
              </a>{" "}
            </Text>
            and enter this room code!
          </Text>
        </Flex>
      </Flex>
    </div>
  );
}
