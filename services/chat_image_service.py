from __future__ import annotations

import time
import uuid

from fastapi import HTTPException

from services.backend_service import BackendService
from services.image_service import ImageGenerationError


IMAGE_MODELS = {"gpt-image-1", "gpt-image-2"}


class ChatImageService:
    def __init__(self, backend_service: BackendService):
        self.backend_service = backend_service

    def is_image_chat_request(self, body: dict[str, object]) -> bool:
        model = str(body.get("model") or "").strip()
        modalities = body.get("modalities")
        if model in IMAGE_MODELS:
            return True
        if isinstance(modalities, list):
            normalized = {str(item or "").strip().lower() for item in modalities}
            return "image" in normalized
        return False

    def create_image_completion(self, body: dict[str, object]) -> dict[str, object]:
        if not self.is_image_chat_request(body):
            raise HTTPException(
                status_code=400,
                detail={"error": "only image generation requests are supported on this endpoint"},
            )

        if bool(body.get("stream")):
            raise HTTPException(status_code=400, detail={"error": "stream is not supported for image generation"})

        model = str(body.get("model") or "gpt-image-1").strip() or "gpt-image-1"
        n = self._parse_image_count(body.get("n"))
        prompt = self._extract_chat_prompt(body)
        if not prompt:
            raise HTTPException(status_code=400, detail={"error": "prompt is required"})

        try:
            image_result = self.backend_service.generate_with_pool(prompt, model, n)
        except ImageGenerationError as exc:
            raise HTTPException(status_code=502, detail={"error": str(exc)}) from exc

        return self._build_chat_image_completion(model, prompt, image_result)

    def _extract_prompt_from_message_content(self, content: object) -> str:
        if isinstance(content, str):
            return content.strip()
        if not isinstance(content, list):
            return ""

        parts: list[str] = []
        for item in content:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type") or "").strip()
            if item_type == "text":
                text = str(item.get("text") or "").strip()
                if text:
                    parts.append(text)
                continue
            if item_type == "input_text":
                text = str(item.get("input_text") or "").strip()
                if text:
                    parts.append(text)
        return "\n".join(parts).strip()

    def _extract_chat_prompt(self, body: dict[str, object]) -> str:
        direct_prompt = str(body.get("prompt") or "").strip()
        if direct_prompt:
            return direct_prompt

        messages = body.get("messages")
        if not isinstance(messages, list):
            return ""

        prompt_parts: list[str] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            role = str(message.get("role") or "").strip().lower()
            if role != "user":
                continue
            prompt = self._extract_prompt_from_message_content(message.get("content"))
            if prompt:
                prompt_parts.append(prompt)

        return "\n".join(prompt_parts).strip()

    def _parse_image_count(self, raw_value: object) -> int:
        try:
            value = int(raw_value or 1)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail={"error": "n must be an integer"}) from exc
        if value < 1 or value > 4:
            raise HTTPException(status_code=400, detail={"error": "n must be between 1 and 4"})
        return value

    def _build_chat_image_completion(
            self,
            model: str,
            prompt: str,
            image_result: dict[str, object],
    ) -> dict[str, object]:
        created = int(image_result.get("created") or time.time())
        image_items = image_result.get("data") if isinstance(image_result.get("data"), list) else []

        markdown_images = []
        images_payload = []
        content_parts = []

        for index, item in enumerate(image_items, start=1):
            if not isinstance(item, dict):
                continue
            b64_json = str(item.get("b64_json") or "").strip()
            revised_prompt = str(item.get("revised_prompt") or prompt).strip()
            if not b64_json:
                continue
            image_data_url = f"data:image/png;base64,{b64_json}"
            markdown_images.append(f"![image_{index}]({image_data_url})")
            images_payload.append(
                {
                    "b64_json": b64_json,
                    "revised_prompt": revised_prompt,
                    "url": image_data_url,
                }
            )
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": image_data_url,
                    },
                }
            )

        text_content = "\n\n".join(markdown_images) if markdown_images else "Image generation completed."
        content_parts.insert(
            0,
            {
                "type": "text",
                "text": text_content,
            },
        )

        return {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": created,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": text_content,
                        "content_parts": content_parts,
                        "images": images_payload,
                    },
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
        }
