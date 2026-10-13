# Fatti: acme-shop, checkout in CrashLoopBackOff (incidente fittizio)

Unica fonte di verità per il video e la pagina. Tutto ciò che appare a schermo o
nella narrazione viene da qui.

## Contesto
- Applicazione: `acme-shop` (comandi lanciati dalla cartella `~/acme-shop`), namespace Kubernetes `shop`.
- Servizio coinvolto: deployment `checkout`.
- Evento: dopo il deploy della versione `checkout:2.4.0`, il checkout del sito risponde
  con errore 503.

## 1. Sintomo
```
$ kubectl get pods -n shop
NAME                        READY   STATUS             RESTARTS   AGE
checkout-7d9f8c6b5-x2kqp    0/1     CrashLoopBackOff   6          8m
cart-5c8b7d9f4-p9wzt        1/1     Running            0          3d
```

## 2. Diagnosi: dettagli del pod
```
$ kubectl describe pod checkout-7d9f8c6b5-x2kqp -n shop
...
    Last State:     Terminated
      Reason:       Error
      Exit Code:    1
...
Events:
  Warning  BackOff  2m (x24 over 8m)  kubelet  Back-off restarting failed container
```

## 3. Diagnosi: log del container
```
$ kubectl logs checkout-7d9f8c6b5-x2kqp -n shop --previous
Starting checkout service v2.4.0
Error: required environment variable DATABASE_URL is not set
```

## 4. Causa
La versione 2.4.0 legge la connessione al database dalla variabile `DATABASE_URL`
(prima usava `DB_HOST` e `DB_PORT`). Il manifest del deployment non è stato aggiornato:
la variabile non esiste nel container.

## 5. Fix
La connessione esiste già nel secret `checkout-db`, alla chiave `url`.
Si aggiunge al container `checkout` del deployment:
```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: checkout-db
        key: url
```
Poi si applica e si riavvia:
```
$ kubectl apply -f checkout-deployment.yaml -n shop
deployment.apps/checkout configured
$ kubectl rollout restart deployment/checkout -n shop
deployment.apps/checkout restarted
```

## 6. Verifica
```
$ kubectl rollout status deployment/checkout -n shop
deployment "checkout" successfully rolled out
$ kubectl get pods -n shop -l app=checkout
NAME                        READY   STATUS    RESTARTS   AGE
checkout-6b8d9f7c4-m4vtr    1/1     Running   0          40s
```
Il checkout del sito risponde di nuovo con 200.

## 7. Lezione
Quando una nuova versione cambia le variabili d'ambiente richieste, il manifest va
aggiornato nello stesso rilascio: le variabili richieste vanno elencate nelle note di
rilascio e controllate prima del deploy.
