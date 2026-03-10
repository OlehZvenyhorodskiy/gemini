"""
Firestore Client — optional persistence layer for NEXUS sessions.

Saves conversation history, generated content (images, stories),
and session metadata to Cloud Firestore. Designed to fail silently
when Firestore isn't configured — everything still works, you just
lose persistence between page refreshes.

Collections:
  nexus_sessions/{session_id}          — session metadata
  nexus_sessions/{session_id}/messages — ordered conversation messages
  nexus_sessions/{session_id}/artifacts — generated images, stories, etc.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger("nexus.firestore")

# Try to import firebase — graceful fail if not available
_HAS_FIREBASE = False
_db = None

try:
    import firebase_admin
    from firebase_admin import credentials, firestore

    # Only init if we have the required env vars
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    database_id = os.getenv("FIRESTORE_DATABASE", "(default)")

    if project_id:
        # Use application default credentials or service account
        if not firebase_admin._apps:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred, {"projectId": project_id})

        _db = firestore.client(database_id=database_id)
        _HAS_FIREBASE = True
        logger.info(f"Firestore connected (project: {project_id}, db: {database_id})")
    else:
        logger.info("GOOGLE_CLOUD_PROJECT not set — Firestore disabled")

except Exception as e:
    logger.info(f"Firestore not available: {e} — running without persistence")


class FirestoreClient:
    """
    Wraps Firestore operations for session persistence.
    Every method is a no-op when Firestore isn't configured.
    """

    def __init__(self) -> None:
        self.enabled = _HAS_FIREBASE and _db is not None
        if self.enabled:
            logger.info("FirestoreClient ready")
        else:
            logger.info("FirestoreClient in pass-through mode (no Firestore)")

    async def save_session_meta(
        self, session_id: str, mode: str, metadata: dict[str, Any] | None = None
    ) -> None:
        """Save or update session metadata."""
        if not self.enabled:
            return

        try:
            doc_ref = _db.collection("nexus_sessions").document(session_id)
            doc_data = {
                "session_id": session_id,
                "mode": mode,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if metadata:
                doc_data.update(metadata)

            # merge=True so we don't overwrite existing data
            doc_ref.set(doc_data, merge=True)

        except Exception as e:
            logger.error(f"Failed to save session meta: {e}")

    async def save_message(
        self, session_id: str, message: dict[str, Any]
    ) -> None:
        """Save a single message to the session's message history."""
        if not self.enabled:
            return

        try:
            msg_data = {
                **message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

            # Remove large binary data from persistence (images stored separately)
            if "data" in msg_data and msg_data.get("type") == "audio":
                return  # Don't persist raw audio chunks

            _db.collection("nexus_sessions").document(session_id)\
               .collection("messages").add(msg_data)

        except Exception as e:
            logger.error(f"Failed to save message: {e}")

    async def save_artifact(
        self,
        session_id: str,
        artifact_type: str,
        data: str,
        metadata: dict[str, Any] | None = None,
    ) -> Optional[str]:
        """
        Save a generated artifact (image, story, etc.).
        Returns the artifact document ID.
        """
        if not self.enabled:
            return None

        try:
            artifact_data: dict[str, Any] = {
                "type": artifact_type,
                "data": data[:10000],  # Truncate very large payloads
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            if metadata:
                artifact_data.update(metadata)

            _, doc_ref = _db.collection("nexus_sessions").document(session_id)\
                            .collection("artifacts").add(artifact_data)

            return doc_ref.id

        except Exception as e:
            logger.error(f"Failed to save artifact: {e}")
            return None

    async def load_history(
        self, session_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Load conversation history for a session."""
        if not self.enabled:
            return []

        try:
            messages_ref = _db.collection("nexus_sessions").document(session_id)\
                              .collection("messages")\
                              .order_by("timestamp")\
                              .limit(limit)

            docs = messages_ref.stream()
            return [doc.to_dict() for doc in docs]

        except Exception as e:
            logger.error(f"Failed to load history: {e}")
            return []

    async def list_sessions(self, limit: int = 20) -> list[dict[str, Any]]:
        """List recent sessions for the 'Continue conversation' UI."""
        if not self.enabled:
            return []

        try:
            sessions_ref = _db.collection("nexus_sessions")\
                              .order_by("updated_at", direction=firestore.Query.DESCENDING)\
                              .limit(limit)

            docs = sessions_ref.stream()
            return [doc.to_dict() for doc in docs]

        except Exception as e:
            logger.error(f"Failed to list sessions: {e}")
            return []

    async def delete_session(self, session_id: str) -> None:
        """Delete a session and all its sub-collections."""
        if not self.enabled:
            return

        try:
            doc_ref = _db.collection("nexus_sessions").document(session_id)

            # Delete sub-collections first
            for subcol in ["messages", "artifacts"]:
                for doc in doc_ref.collection(subcol).stream():
                    doc.reference.delete()

            doc_ref.delete()
            logger.info(f"Deleted session {session_id} from Firestore")

        except Exception as e:
            logger.error(f"Failed to delete session: {e}")

    async def get_user_profile(self, user_id: str) -> str:
        """Retrieve the concatenated facts about this user."""
        if not self.enabled or not user_id or user_id == "anonymous":
            return ""

        try:
            doc_ref = _db.collection("nexus_users").document(user_id)
            doc = doc_ref.get()
            if doc.exists:
                data = doc.to_dict()
                return data.get("profile_facts", "")
            return ""
        except Exception as e:
            logger.error(f"Failed to get user profile: {e}")
            return ""

    async def save_user_fact(self, user_id: str, fact: str) -> bool:
        """Append a new fact to the user's permanent profile."""
        if not self.enabled or not user_id or user_id == "anonymous":
            return False

        try:
            doc_ref = _db.collection("nexus_users").document(user_id)
            doc = doc_ref.get()
            
            existing_facts = ""
            if doc.exists:
                existing_facts = doc.to_dict().get("profile_facts", "")
            
            # Simple append with bullet point
            new_facts = existing_facts + f"\n- {fact}" if existing_facts else f"- {fact}"
            
            doc_ref.set({
                "profile_facts": new_facts,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }, merge=True)
            
            logger.info(f"Saved fact for user {user_id}: {fact}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save user fact: {e}")
            return False
