import psycopg2, hashlib, random

conn = psycopg2.connect('postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway')
cur = conn.cursor()

otp = str(random.randint(100000, 999999))
otp_hash = hashlib.sha256(otp.encode()).hexdigest()

cur.execute(
    "UPDATE assinaturas SET token_otp = %s, token_expira_em = NOW() + INTERVAL '30 minutes' WHERE contrato_id = '7196cca6-9c0c-4355-9281-29785477def2' AND papel = 'outorgado'",
    (otp_hash,)
)
conn.commit()
print('OTP para teste:', otp)
conn.close()
