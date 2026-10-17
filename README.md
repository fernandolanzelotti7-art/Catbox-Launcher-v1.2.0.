# Catbox Launcher — v1.2.0 release candidate 1

Aplicativo independente para Windows; não é afiliado, patrocinado ou aprovado pela Roblox Corporation.

## Recursos
- Identificação da versão oficial do Roblox por processo observado.
- Aplicação de uma única fonte TTF ou OTF às famílias BuilderSans e SourceSansPro (compatibilidade testada pelo usuário em Windows; não é conversão de formato).
- Personalização de cursores PNG, backup e restauração.
- Encerramento do Roblox mediante confirmação explícita.
- Link de suporte no Discord.

## Compilar
```powershell
npm install
npm run check
npm run dist
npm audit
```
O instalador gerado no Windows fica em `release/Catbox Launcher Setup 1.2.0-rc.1.exe`.

## Antes de distribuir
1. **Segurança**: a compilação anterior mostrou 8 avisos moderados e 2 altos. O relatório detalhado `npm audit` ainda precisa ser examinado no Windows. Não execute `npm audit fix --force` sem testar a aplicação.
2. **Licenças**: confirme autorização de distribuição da ilustração `assets/frieren-personal.png` ou substitua por arte própria/licenciada. A licença MIT do código não licencia automaticamente a imagem.
3. **Compatibilidade**: valide instalação limpa, fontes TTF e OTF, restauração e atualizações do Roblox.
4. **Distribuição**: use somente instaladores gerados por você e, idealmente, assinatura de código confiável. Mensagens de assinatura no log do electron-builder não comprovam certificado de editor confiável.

## Limitações
A troca de fontes copia os bytes da fonte escolhida para arquivos com extensões `.otf` e `.ttf`. Isso não converte o formato. O Roblox pode mudar seu funcionamento em atualizações. O Catbox não modifica o fundo da Home do aplicativo oficial.
