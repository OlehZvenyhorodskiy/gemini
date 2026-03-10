from typing import Any, Dict, Literal, Optional, Union
from pydantic import BaseModel, Field

# --- Incoming Messages (Client -> Server) ---

class ClientAudioMessage(BaseModel):
    type: Literal["audio"]
    data: str

class ClientVideoMessage(BaseModel):
    type: Literal["video"]
    data: str

class ClientTextMessage(BaseModel):
    type: Literal["text"]
    content: str

class ClientModeMessage(BaseModel):
    type: Literal["mode"]
    mode: str

class ClientInterruptMessage(BaseModel):
    type: Literal["interrupt"]

class ClientConfigMessage(BaseModel):
    type: Literal["config"]
    settings: Dict[str, Any]

ClientMessage = Union[
    ClientAudioMessage,
    ClientVideoMessage,
    ClientTextMessage,
    ClientModeMessage,
    ClientInterruptMessage,
    ClientConfigMessage
]

# --- Outgoing Messages (Server -> Client) ---

class ServerAudioMessage(BaseModel):
    type: Literal["audio"] = "audio"
    data: str

class ServerTextMessage(BaseModel):
    type: Literal["text"] = "text"
    content: str

class ServerImageMessage(BaseModel):
    type: Literal["image"] = "image"
    data: str
    mime: str = "image/png"

class ServerStatusMessage(BaseModel):
    type: Literal["status"] = "status"
    state: str
    session_id: Optional[str] = None
    message: Optional[str] = None
    mode: Optional[str] = None

class ServerToolCallMessage(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    name: str
    args: Dict[str, Any]

class ServerToolResultMessage(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    name: str
    result: Dict[str, Any]

class ServerErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    message: str

ServerMessage = Union[
    ServerAudioMessage,
    ServerTextMessage,
    ServerImageMessage,
    ServerStatusMessage,
    ServerToolCallMessage,
    ServerToolResultMessage,
    ServerErrorMessage
]
