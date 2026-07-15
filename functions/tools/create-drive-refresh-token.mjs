import http from 'node:http'
import { google } from 'googleapis'

const port = 53682
const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
const clientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID
const clientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET

if (!clientId || !clientSecret) {
  throw new Error('請先設定 GOOGLE_DRIVE_OAUTH_CLIENT_ID 與 GOOGLE_DRIVE_OAUTH_CLIENT_SECRET。')
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
const authorizationUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
})

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, redirectUri)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('未收到 Google 授權碼。')
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.refresh_token) {
      throw new Error('未取得 refresh token，請確認使用 prompt=consent 並重新授權。')
    }

    console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`)
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>授權完成</h1><p>請回到終端機，將 refresh token 寫入 Firebase Secret Manager；不要貼到聊天或前端 .env。</p>')
  } catch (error) {
    console.error(error)
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('交換 refresh token 失敗，請查看終端機。')
  } finally {
    server.close()
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log('請以主要 Google Drive 帳號在瀏覽器開啟以下網址：')
  console.log(authorizationUrl)
})
