# ── AMI Data Source ───────────────────────────────────────────────────────────

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ── Master Node ───────────────────────────────────────────────────────────────

resource "aws_instance" "master" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t2.medium"
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.codesync_sg.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 20
    volume_type = "gp2"
  }

  tags = merge(local.common_tags, {
    Name = "codesync-master"
    Role = "master"
  })
}

# ── Worker Node 1 ─────────────────────────────────────────────────────────────

resource "aws_instance" "worker1" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.codesync_sg.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 15
    volume_type = "gp2"
  }

  tags = merge(local.common_tags, {
    Name = "codesync-worker-1"
    Role = "worker"
  })
}

# ── Worker Node 2 ─────────────────────────────────────────────────────────────

resource "aws_instance" "worker2" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = "t2.micro"
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.codesync_sg.id]
  key_name                    = var.key_name
  associate_public_ip_address = true

  root_block_device {
    volume_size = 15
    volume_type = "gp2"
  }

  tags = merge(local.common_tags, {
    Name = "codesync-worker-2"
    Role = "worker"
  })
}
