FROM python:3.12-slim

WORKDIR /app

# 의존성 복사
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사
COPY server.py .
COPY sse_manager.py .

# 데이터 디렉토리 생성
RUN mkdir -p /app/data

# 포트 노출
EXPOSE 5051

# 환경 변수
ENV FLASK_APP=server.py
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# 서버 실행
CMD ["python", "server.py"]
