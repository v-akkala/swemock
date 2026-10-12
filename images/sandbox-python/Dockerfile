# swemock sandbox: Python 3.12 + pytest. Build context: images/
FROM python:3.12.15-slim-bookworm
RUN pip install --no-cache-dir pytest==9.1.1
COPY common/agent.py /sandbox/agent.py
COPY sandbox-python/driver.py /sandbox/python/driver.py
RUN python3 -m compileall -q /sandbox
ENV PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python3", "/sandbox/agent.py"]
