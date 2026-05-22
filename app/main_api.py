import uvicorn
from fastapi import FastAPI, Request, Query
from fastapi.responses import PlainTextResponse

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Campo Digital Online"}

# Rota de Validação do WhatsApp
@app.get("/wapp/inbound")
async def verify_webhook(
    mode: str = Query(None, alias="hub.mode"),
    token: str = Query(None, alias="hub.verify_token"),
    challenge: str = Query(None, alias="hub.challenge")
):
    print(f"--- TENTATIVA DE VALIDAÇÃO ---")
    print(f"Token: {token}")
    
    if mode == "subscribe" and token == "campo_digital_2026":
        print("✅ VALIDAÇÃO APROVADA!")
        return PlainTextResponse(content=challenge)
    
    return PlainTextResponse(content="Falha na validação", status_code=403)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
