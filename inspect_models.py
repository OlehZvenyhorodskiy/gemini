
from google import genai

API_KEY = "AIzaSyA6yTyGfvQAAKScTpKFEShIyLSRVnx0Ou0"
client = genai.Client(api_key=API_KEY, http_options={"api_version": "v1alpha"})

for m in client.models.list():
    if "flash" in m.name:
        dump = m.model_dump()
        print(f"{m.name}: {dump.keys()}")
        if 'supported_generation_methods' in dump:
             print(f"   Methods: {dump['supported_generation_methods']}")
