# swemock sandbox: g++ (C++20, -O2) + doctest. Build context: images/
FROM debian:trixie-20261005-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends g++=4:14.2.0-1 python3=3.13.5-1 curl ca-certificates \
 && mkdir -p /sandbox/cpp \
 && curl -fsSL -o /sandbox/cpp/doctest.h https://raw.githubusercontent.com/doctest/doctest/v2.5.3/doctest/doctest.h \
 && echo "cfd518a3ef90f67e1f3ba514df23fb3627437de1a2feeba78cf5062a40021421  /sandbox/cpp/doctest.h" | sha256sum -c - \
 && apt-get purge -y curl ca-certificates && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY common/agent.py /sandbox/agent.py
COPY sandbox-cpp/swemock.hpp /sandbox/cpp/swemock.hpp
# Precompile the runtime header; the runner compiles drivers with exactly these flags.
RUN g++ -std=c++20 -O2 -x c++-header /sandbox/cpp/swemock.hpp -o /sandbox/cpp/swemock.hpp.gch \
 && python3 -m compileall -q /sandbox
ENV PYTHONDONTWRITEBYTECODE=1
USER 65534:65534
WORKDIR /work
ENTRYPOINT ["python3", "/sandbox/agent.py"]
