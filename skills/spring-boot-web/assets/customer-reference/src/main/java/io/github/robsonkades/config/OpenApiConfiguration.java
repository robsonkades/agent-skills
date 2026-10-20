package io.github.robsonkades.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.async.WebAsyncTask;

@Configuration(proxyBeanMethods = false)
public class OpenApiConfiguration {

    static {
        // O corpo HTTP de WebAsyncTask<T> é T; o wrapper pertence ao processamento do Spring.
        SpringDocUtils.getConfig().addResponseWrapperToIgnore(WebAsyncTask.class);
    }

    @Bean
    OpenAPI customerOpenApi() {
        return new OpenAPI().info(new Info()
                .title("Customer API")
                .version("1.0.0")
                .description("""
                        API para cadastro, consulta e atualização de clientes.

                        Entradas e respostas de sucesso usam JSON; PATCH exige application/merge-patch+json.
                        Os corpos de POST, PUT e PATCH são obrigatórios. required indica presença obrigatória;
                        o tipo null indica quando um valor nulo é aceito. Omitir um campo opcional e enviar null
                        podem produzir efeitos diferentes, descritos em cada schema.

                        POST/PUT validam os tamanhos máximos antes de remover espaços nas extremidades.
                        Nome, e-mail, telefone e textos obrigatórios do endereço não aceitam valores em branco.
                        CPF exige dígitos verificadores válidos e é retornado somente com números.
                        Datas usam AAAA-MM-DD: POST/PUT exigem nascimento anterior a hoje; PATCH permite hoje,
                        conforme a data do servidor. Restrições relativas à data atual e verificadores de CPF
                        são descritas em texto, pois não são expressas por um limite estático do OpenAPI.

                        PATCH aceita apenas as propriedades documentadas, exige ao menos uma e não aplica
                        os limites máximos de texto de POST/PUT. Um endereço enviado no PATCH substitui o
                        endereço inteiro. As consultas são paginadas, com índices começando em zero,
                        tamanho padrão 20 e máximo 100. A busca avançada permite até 20 filtros e 3
                        critérios de ordenação. Não há autenticação exigida pela aplicação atualmente.

                        Todas as operações compartilham o contrato de erros Problem Details (RFC 9457),
                        com conteúdo `application/problem+json` e os campos obrigatórios `type`, `title`,
                        `status`, `detail` e `instance`. Extensões opcionais aparecem na raiz do JSON,
                        sem um objeto `properties`. Use `type` para identificar o problema; mensagens de
                        validação podem variar conforme o idioma da requisição.

                        As respostas padrão abaixo são um catálogo comum: autenticação, autorização,
                        limites, versionamento e integrações só produzem seus respectivos erros quando
                        aplicáveis à operação e à configuração do serviço. A documentação não habilita
                        esses recursos. Os exemplos são ilustrativos; `instance` identifica o caminho real
                        da ocorrência. As respostas específicas de negócio complementam esse contrato.
                        """));
    }
}
