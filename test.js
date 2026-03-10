const { GoogleGenAI } = require('@google/genai')
const ai = new GoogleGenAI({})
async function runTest() {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'Напиши слово Успех'
    })
    console.log(response.text)
}
runTest()