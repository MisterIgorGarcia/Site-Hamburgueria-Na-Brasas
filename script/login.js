const SUPABASE_URL = 'https://xzaqqzlfwkjtksjlcbgx.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_hoYHM3UKlvTDMCaadvI1kQ_gcn9-pqq'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formLogin = document.getElementById('form-login');
const loginErro = document.getElementById('login-erro');

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-entrar');
  const login = document.getElementById('inp-login').value.trim();
  const senha = document.getElementById('inp-senha').value;

  btn.disabled = true;
  btn.textContent = 'Verificando...';
  loginErro.textContent = '';

  try {
    // 1. Tenta logar como ADMIN
    let { data: dataAdmin, error: errorAdmin } = await supabaseClient.rpc('login_admin', {
      p_login: login, p_senha: senha
    });
    
    if (errorAdmin) throw errorAdmin;

    if (dataAdmin?.success) {
      // É Admin! Salva a sessão e vai para o painel do dono
      localStorage.setItem('nabrasas_sessao', JSON.stringify({ tipo: 'admin', nome: dataAdmin.login }));
      window.location.href = 'administrador/administrador-dashboard.html';
      return;
    }

    // 2. Se não achou no admin, tenta logar como FUNCIONÁRIO (usuario)
    let { data: dataUser, error: errorUser } = await supabaseClient.rpc('login_usuario', {
      p_login: login, p_senha: senha
    });

    if (errorUser) throw errorUser;

    if (dataUser?.success) {
      // É Funcionário! Salva a sessão e vai para o painel do funcionário
      localStorage.setItem('nabrasas_sessao', JSON.stringify({ tipo: 'funcionario', nome: dataUser.login }));
      window.location.href = 'funcionario-dashboard.html';
      return;
    }

    // Se chegou aqui, não achou em nenhuma das duas tabelas
    loginErro.textContent = 'Login ou senha inválidos.';

  } catch (err) {
    console.error(err);
    loginErro.textContent = 'Erro ao conectar. Tente novamente.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});