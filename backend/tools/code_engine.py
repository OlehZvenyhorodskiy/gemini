import os
import logging
from typing import Any, Dict

logger = logging.getLogger("nexus.code_engine")

class CodeEngine:
    """
    Provides real filesystem read access for the Code Copilot mode.
    Restricts access to a predefined SAFE_DIR to prevent reading arbitrary system files.
    """
    
    def __init__(self, safe_dir: str = "C:/Projects/GEMINI-hackaton"):
        # Resolve the absolute path to prevent traversal attacks
        self.safe_dir = os.path.abspath(safe_dir)
        logger.info(f"CodeEngine initialized with safe directory: {self.safe_dir}")

    def _is_safe_path(self, path: str) -> bool:
        """Ensure the requested path is within the allowed safe directory."""
        absolute_request = os.path.abspath(path)
        return absolute_request.startswith(self.safe_dir)

    async def read_directory(self, path: str) -> Dict[str, Any]:
        """
        List the contents of a directory.
        """
        try:
            target_path = os.path.join(self.safe_dir, path) if not os.path.isabs(path) else path
            
            if not self._is_safe_path(target_path):
                return {"error": f"Access denied. Path '{path}' is outside the safe workspace."}
            
            if not os.path.exists(target_path):
                return {"error": f"Directory not found: {path}"}
                
            if not os.path.isdir(target_path):
                return {"error": f"Path is not a directory: {path}"}

            items = os.listdir(target_path)
            
            # Separate files and directories for better context
            directories = []
            files = []
            for item in items:
                # Ignore common hidden/node_modules directories
                if item.startswith('.') or item == 'node_modules' or item == '__pycache__':
                    continue
                    
                full_item_path = os.path.join(target_path, item)
                if os.path.isdir(full_item_path):
                    directories.append(item)
                else:
                    files.append(item)
                    
            return {
                "status": "success",
                "path": target_path,
                "directories": sorted(directories),
                "files": sorted(files)
            }
            
        except Exception as e:
            logger.error(f"Error reading directory {path}: {e}")
            return {"error": str(e)}

    async def read_file(self, file_path: str, max_lines: int = 500) -> Dict[str, Any]:
        """
        Read the textual content of a file.
        Capped at max_lines to prevent overwhelming the LLM context.
        """
        try:
            target_path = os.path.join(self.safe_dir, file_path) if not os.path.isabs(file_path) else file_path
            
            if not self._is_safe_path(target_path):
                return {"error": f"Access denied. Path '{file_path}' is outside the safe workspace."}
                
            if not os.path.exists(target_path):
                return {"error": f"File not found: {file_path}"}
                
            if not os.path.isfile(target_path):
                return {"error": f"Path is not a file: {file_path}"}
                
            # Check file size (prevent reading massive bin files, max 1MB)
            file_size = os.path.getsize(target_path)
            if file_size > 1024 * 1024:
                return {"error": f"File too large to read ({file_size} bytes). Max is 1MB."}

            try:
                with open(target_path, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    
                total_lines = len(lines)
                content = "".join(lines[:max_lines])
                
                return {
                    "status": "success",
                    "file_path": target_path,
                    "total_lines": total_lines,
                    "lines_returned": min(total_lines, max_lines),
                    "content": content,
                    "truncated": total_lines > max_lines
                }
            except UnicodeDecodeError:
                return {"error": "File appears to be binary or not UTF-8 encoded."}

        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return {"error": str(e)}

    async def execute_code(self, code: str, language: str = "python") -> Dict[str, Any]:
        """
        Execute python or javascript code safely.
        """
        import tempfile
        import subprocess
        
        try:
            if language.lower() not in ["python", "javascript", "js", "cpp"]:
                return {"error": f"Language {language} is not supported."}
                
            suffix = ".py"
            cmd = ["python"]
            if language.lower() in ["javascript", "js"]:
                suffix = ".js"
                cmd = ["node"]
            
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode='w', encoding='utf-8') as f:
                f.write(code)
                temp_path = f.name
                
            try:
                cmd.append(temp_path)
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                return {
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.returncode
                }
            except subprocess.TimeoutExpired:
                return {"error": "Execution timed out after 10 seconds."}
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
        except Exception as e:
            return {"error": str(e)}

