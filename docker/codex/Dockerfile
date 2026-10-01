FROM docker/sandbox-templates:codex

USER root
COPY shared/install-openleira.sh /tmp/install-openleira.sh
RUN chmod +x /tmp/install-openleira.sh && /tmp/install-openleira.sh

USER agent
RUN --mount=type=cache,target=/tmp/npm-cache,sharing=locked,mode=0777 \
    npm install -g openleira \
      --cache=/tmp/npm-cache \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=20000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=600000 \
      --no-audit \
      --no-fund && \
    openleira --version

COPY --chown=agent:agent shared/start-openleira.sh /home/agent/.openleira-start.sh
RUN echo '. ~/.openleira-start.sh' >> /home/agent/.bashrc
