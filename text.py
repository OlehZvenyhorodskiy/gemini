from anthropic import AnthropicVertex
client = AnthropicVertex(region="europe-west4", project_id="project-1a707446-a9a9-4354-9f5")
message = client.messages.create(
max_tokens=10024,
messages=[{"role": "user", "content": "Напиши слово Успех"}],
model="claude-opus-4-6"
)
print(message.content[0].text)